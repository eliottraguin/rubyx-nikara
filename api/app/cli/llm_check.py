"""`llm-check` (GR3-61) : un appel minimal réel au fournisseur configuré (`mock`, `real` ou `codex`).

Diagnostic manuel uniquement (propriétaire, accès réseau requis pour `real`/`codex`) : affiche succès/échec,
latence et tokens, jamais la clé, l'URL ni le contenu échangé avec le modèle."""

from __future__ import annotations

import asyncio
from typing import Any

from ..llm import LLMAdapter, LLMRequest, LLMStatus

PROBE_CONTEXT = "Réponds par le mot OK."
PROBE_MAX_OUTPUT_TOKENS = 20


def run_llm_check(llm: LLMAdapter, role: str = "scout") -> dict[str, Any]:
    request = LLMRequest(role=role, context=PROBE_CONTEXT, max_output_tokens=PROBE_MAX_OUTPUT_TOKENS)
    response = asyncio.run(llm.generate(request))
    usage = (
        {"input_tokens": response.usage.input_tokens, "output_tokens": response.usage.output_tokens, "measured": response.usage.measured}
        if response.usage is not None
        else None
    )
    return {
        "ok": response.status == LLMStatus.OK,
        "provider": llm.name,
        "simulated": llm.simulated,
        "role": role,
        "status": response.status.value,
        "duration_ms": response.duration_ms,
        "usage": usage,
    }
