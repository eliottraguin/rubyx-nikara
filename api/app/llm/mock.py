"""Fournisseur simulé : déterministe, sans réseau (même entrée => même sortie)."""

from __future__ import annotations

import hashlib
import json
import re

from .base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus, Usage

_LABELS = {
    "writer": "rédacteur",
    "prospector": "prospecteur",
    "researcher": "chargé de veille",
    "analyst": "analyste",
    "qa": "responsable qualité",
    "lead": "chef d'équipe",
}

_DELIVERABLE = re.compile(r"<<<LIVRABLE nonce=(\w+)>>>\n(.*?)\n<<<FIN nonce=\1>>>", re.S)


class MockLLMAdapter(LLMAdapter):
    name = "mock"
    simulated = True

    async def generate(self, request: LLMRequest) -> LLMResponse:
        digest = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        title = (request.expected_schema or {}).get("title")
        if title == "LeadPlan":
            return self._plan(request, digest)
        if title == "EvaluatorOutput":
            return self._evaluation(request, digest)
        content = f"[Réponse simulée du {_LABELS[request.role.value]}] Référence {digest[:8]}."
        return self._response(request, content, digest)

    def _response(self, request: LLMRequest, content: str, digest: str) -> LLMResponse:
        # Estimation grossière (4 caractères ~ 1 token), signalée comme non mesurée.
        usage = Usage(
            input_tokens=max(1, len(request.context) // 4),
            output_tokens=min(request.max_output_tokens, max(1, len(content) // 4)),
            measured=False,
        )
        return LLMResponse(
            content=content, tool_calls=[], usage=usage, duration_ms=0, provider_call_id=f"mock_{digest[:12]}", status=LLMStatus.OK
        )

    def _plan(self, request: LLMRequest, digest: str) -> LLMResponse:
        """Plan borné déterministe du chef : une seule étape confiée au rédacteur (toujours possédé)."""
        content = json.dumps(
            {
                "steps": [{"role": "writer", "task": "Rédiger la réponse demandée", "source_ids": [], "depends_on": None}],
                "summary": "[Plan simulé] Confier la rédaction au rédacteur.",
            },
            ensure_ascii=False,
        )
        return self._response(request, content, digest)

    def _evaluation(self, request: LLMRequest, digest: str) -> LLMResponse:
        """Évaluation simulée : le « juge » donne 1,0 à tous les critères sur un livrable non vide, citant le début
        du livrable (preuve littérale) ; 0 et hors sujet sur un livrable vide. Les contrôles déterministes du serveur
        restent seuls maîtres du score final."""
        m = _DELIVERABLE.search(request.context)
        text = m.group(2) if m else ""
        meta = request.metadata
        quote = " ".join(text.split())[:60].rstrip()
        # une citation tronquée au milieu d'un mot reste littérale : c'est une sous-chaîne du livrable
        empty = not text.strip()
        criteria = [
            {
                "id": cid,
                "rating": 0.0 if empty else 1.0,
                "evidence": "" if empty else quote,
                "comment": "[Simulé] Livrable vide." if empty else "[Simulé] Critère jugé satisfaisant.",
            }
            for cid in meta.get("criteria_ids", [])
        ]
        content = json.dumps(
            {
                "submission_id": meta.get("submission_id", ""),
                "rubric_version": meta.get("rubric_id", ""),
                "out_of_scope": empty,
                "criteria": criteria,
                "client_feedback": "[Retour simulé] Merci pour votre livraison.",
                "next_action": "[Simulé] Relire le brief puis ajuster si besoin.",
            },
            ensure_ascii=False,
        )
        return self._response(request, content, digest)
