"""Fournisseur réel : relais compatible avec le protocole Messages d'Anthropic (voir docs/ai/01-adaptateur-llm-ai01.md).

Contrat avec `call_provider` : une erreur technique est rendue par un statut (`TIMEOUT`, `ERROR`) et jamais par une
exception ; le retry technique est fait par l'appelant. Aucun contenu de requête ou de réponse, aucune clé ni prompt
système dans les journaux, les messages ou les erreurs (règles 2 et 6)."""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any

import httpx

from .base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus, ToolCall, Usage
from .models_spec import LLMModels

log = logging.getLogger("rubix.llm")

ANTHROPIC_VERSION = "2023-06-01"
TEMPERATURE = 0.2
_FENCE = re.compile(r"```(?:json)?\s*\n(.*?)\n```", re.DOTALL)


class RealLLMAdapter(LLMAdapter):
    name = "real"
    simulated = False

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        models: LLMModels,
        data_dir: Path | None = None,
        timeout_seconds: float = 40.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._models = models
        self._data_dir = data_dir
        self._timeout = timeout_seconds
        self._transport = transport
        self._tools = self._load_tools()

    def __repr__(self) -> str:  # jamais de clé ni d'URL
        return "RealLLMAdapter()"

    # --- données de rôle -------------------------------------------------------------------------
    def _load_json(self, rel: str) -> Any:
        if self._data_dir is None:
            return None
        try:
            return json.loads((self._data_dir / rel).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def _load_tools(self) -> dict[str, dict[str, Any]]:
        data = self._load_json("roles/tools.json") or {}
        return {t["id"]: t for t in data.get("tools", []) if isinstance(t, dict) and "id" in t}

    def _system(self, role: str) -> str | None:
        if not re.fullmatch(r"[a-z_]+", role):
            return None
        data = self._load_json(f"roles/{role}.json")
        text = data.get("system_instructions") if isinstance(data, dict) else None
        return text if isinstance(text, str) and text.strip() else None

    # --- requête ---------------------------------------------------------------------------------
    def build_payload(self, request: LLMRequest) -> dict[str, Any]:
        role = str(getattr(request.role, "value", request.role))
        user = request.context
        if request.expected_schema is not None:
            user += (
                "\n\nRéponds uniquement par un objet JSON valide conforme à ce schéma, sans texte autour :\n"
                + json.dumps(request.expected_schema, ensure_ascii=False)
            )
        payload: dict[str, Any] = {
            "model": self._models.for_role(role),
            "max_tokens": request.max_output_tokens,
            "temperature": TEMPERATURE,
            "messages": [{"role": "user", "content": user}],
        }
        system = self._system(role)
        if system:
            payload["system"] = system
        if request.allowed_tools:
            tools = []
            for tool_id in request.allowed_tools:
                spec = self._tools.get(tool_id, {})
                tools.append(
                    {
                        "name": tool_id,
                        "description": str(spec.get("description", tool_id)),
                        "input_schema": spec.get("parameters") or {"type": "object", "properties": {}},
                    }
                )
            payload["tools"] = tools
        return payload

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self._api_key,
            "authorization": f"Bearer {self._api_key}",
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    # --- appel -----------------------------------------------------------------------------------
    async def generate(self, request: LLMRequest) -> LLMResponse:
        start = time.monotonic()
        payload = self.build_payload(request)
        model = payload["model"]

        def elapsed() -> int:
            return int((time.monotonic() - start) * 1000)

        def failed(status: LLMStatus) -> LLMResponse:
            return LLMResponse(content="", duration_ms=elapsed(), provider_call_id="", status=status)

        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=self._timeout) as client:
                http = await client.post(f"{self._base_url}/v1/messages", headers=self._headers(), json=payload)
        except httpx.TimeoutException:
            log.warning("llm_call model=%s status=timeout duration_ms=%d", model, elapsed())
            return failed(LLMStatus.TIMEOUT)
        except httpx.HTTPError:
            log.warning("llm_call model=%s status=network_error duration_ms=%d", model, elapsed())
            return failed(LLMStatus.ERROR)

        if http.status_code != 200:
            log.warning("llm_call model=%s http=%d duration_ms=%d", model, http.status_code, elapsed())
            return failed(LLMStatus.ERROR)  # corps de la relais jamais relayé ni journalisé

        try:
            body = http.json()
            blocks = body["content"]
            if not isinstance(blocks, list):
                raise TypeError
        except (ValueError, KeyError, TypeError):
            log.warning("llm_call model=%s http=200 status=invalid_body duration_ms=%d", model, elapsed())
            return failed(LLMStatus.INVALID_OUTPUT)

        allowed = set(request.allowed_tools)
        texts: list[str] = []
        calls: list[ToolCall] = []
        for block in blocks:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                texts.append(block["text"])
            elif block.get("type") == "tool_use" and block.get("name") in allowed:
                args = block.get("input")
                calls.append(ToolCall(name=block["name"], arguments=args if isinstance(args, dict) else {}, id=block.get("id")))
        content = "".join(texts)
        if request.expected_schema is not None:
            fenced = _FENCE.search(content)
            if fenced and not content.strip().startswith(("{", "[")):
                content = fenced.group(1).strip()  # lecture tolérante ; la validation reste côté serveur

        usage = None
        raw = body.get("usage") if isinstance(body, dict) else None
        if isinstance(raw, dict) and isinstance(raw.get("input_tokens"), int) and isinstance(raw.get("output_tokens"), int):
            usage = Usage(input_tokens=raw["input_tokens"], output_tokens=raw["output_tokens"], measured=True)

        call_id = str(body.get("id", "")) if isinstance(body, dict) else ""
        status = LLMStatus.OK if (content.strip() or calls) else LLMStatus.INVALID_OUTPUT
        log.info(
            "llm_call model=%s http=200 status=%s duration_ms=%d in=%s out=%s",
            model, status.value, elapsed(), usage.input_tokens if usage else None, usage.output_tokens if usage else None,
        )
        return LLMResponse(content=content, tool_calls=calls, usage=usage, duration_ms=elapsed(), provider_call_id=call_id, status=status)
