"""Fournisseur `codex` : SDK AXIS / Codex, branché via la relais compatible Messages d'Anthropic
(docs/ai/01-adaptateur-llm-ai01.md). Investigation GR3-61 : la relais AXIS parle directement HTTP (protocole
Messages d'Anthropic) et est accessible depuis le serveur Python sans pont Node ; `index.mjs` (essai isolé
`@axis/sdk`, absent de `package.json`) n'est pas utilisé et aucun pont n'est ajouté. Seuls des modèles Claude sont
servis sur le groupe AXIS actuel (aucun modèle codex, voir `docs/OPEN-QUESTIONS.md` #65) : ce fournisseur réutilise
donc le même protocole et la même implémentation que `real`, sous le nom `codex` attendu par le produit
(docs/PLAN-V2.md §5)."""

from __future__ import annotations

from .real import RealLLMAdapter


class CodexLLMAdapter(RealLLMAdapter):
    name = "codex"

    def __repr__(self) -> str:  # jamais de clé ni d'URL
        return "CodexLLMAdapter()"
