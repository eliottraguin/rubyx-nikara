"""Fournisseur simulé : déterministe, sans réseau (même entrée => même sortie)."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata

from .base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus, Usage

_LABELS = {
    "writer": "rédacteur",
    "prospector": "prospecteur",
    "researcher": "chargé de veille",
    "analyst": "analyste",
    "qa": "responsable qualité",
    "lead": "chef d'équipe",
    "scout": "éclaireur",
    "triage": "trieur de boîte",
    "replier": "rédacteur",
    "ads": "directeur de campagne",
}

# Messagerie simulée : blocs de données délimités (voir services/conversations.py)
_THREAD = re.compile(r"<<<FIL nonce=(\w+)>>>\n(.*?)\n<<<FIN FIL nonce=\1>>>", re.S)
_MENTIONS = re.compile(r"\[MENTIONS STANDARD\] origine=.*? \| opposition=(.*?) \| client déjà informé=(oui|non)")
_SYNTH = re.compile(r"\[SYNTHÈSE DE LA CONVERSATION\] intention=(\w+)")
_OPTOUT_HINTS = ("arretez", "stop", "desinscri", "desabonn", "ne plus recevoir", "ne m'ecrivez plus", "retirez moi", "unsubscribe")

_DELIVERABLE = re.compile(r"<<<LIVRABLE nonce=(\w+)>>>\n(.*?)\n<<<FIN nonce=\1>>>", re.S)


class MockLLMAdapter(LLMAdapter):
    name = "mock"
    simulated = True

    async def generate(self, request: LLMRequest) -> LLMResponse:
        digest = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        if request.purpose == "client_sim":
            return self._response(request, str(request.metadata.get("scripted_line", "")), digest)
        if request.purpose.startswith("conversation_triage"):
            return self._response(request, self._triage(request), digest)
        if request.purpose.startswith("conversation_reply"):
            return self._response(request, self._reply(request), digest)
        title = (request.expected_schema or {}).get("title")
        if title == "LeadPlan":
            return self._plan(request, digest)
        if title == "EvaluatorOutput":
            return self._evaluation(request, digest)
        if title == "AdKit":  # kit de campagne simulé (rôle `ads`) : uniquement des éléments de la fiche entreprise
            from .mock_ads import build_kit_json

            return self._response(request, build_kit_json(request.metadata["ads"]), digest)
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

    @staticmethod
    def _client_texts(request: LLMRequest) -> list[str]:
        m = _THREAD.search(request.context)
        if not m:
            return []
        try:
            return [str(x.get("texte", "")) for x in json.loads(m.group(2)) if x.get("de") == "client"]
        except (ValueError, AttributeError):
            return []

    @staticmethod
    def _intention(last: str) -> str:
        low = unicodedata.normalize("NFKD", last.lower()).encode("ascii", "ignore").decode()
        if any(h in low for h in _OPTOUT_HINTS):
            return "desinscription"
        if "?" in last:
            return "question"
        if any(w in low for w in ("budget", "cher", "cout")):
            return "objection"
        if any(w in low for w in ("interess", "parfait", "rendez-vous", "appeler")):
            return "interesse"
        return "hors_sujet"

    def _triage(self, request: LLMRequest) -> str:
        """Synthèse simulée : déterministe, citations littérales du dernier message reçu."""
        last = (self._client_texts(request) or [""])[-1]
        intention = self._intention(last)
        quote = " ".join(last.split())[:120]
        low = last.lower()
        statut = {"interesse": "en_discussion", "question": "en_discussion", "objection": "en_discussion", "refus": "perdu", "desinscription": "ecarte"}.get(intention)
        return json.dumps(
            {
                "intention": intention,
                "points": [{"texte": "[Simulé] Dernier message du client", "citation": quote}] if quote else [],
                "urgence": "elevee" if any(w in low for w in ("urgent", "rapidement", "fin du mois", "cette semaine")) else "normale",
                "statut_suggere": statut,
            },
            ensure_ascii=False,
        )

    def _reply(self, request: LLMRequest) -> str:
        """Brouillon simulé : n'invente rien (aucun chiffre, aucune URL) ; reprend la mention d'opposition fournie."""
        last = (self._client_texts(request) or [""])[-1]
        synth = _SYNTH.search(request.context)
        intention = synth.group(1) if synth else self._intention(last)
        mentions = _MENTIONS.search(request.context)
        informed = bool(mentions and mentions.group(2) == "oui")
        a_verifier: list[str] = []
        if intention == "desinscription":
            body = "Bonjour, bien noté : je ne vous écrirai plus. Bonne continuation."
        else:
            if "?" in last:
                core = "Je reviens vers vous avec une réponse précise à votre question."
                a_verifier = ["Informations demandées par le client, à confirmer avec la fiche entreprise"]
            elif intention == "objection":
                core = "Je comprends votre contrainte ; nous pouvons avancer pas à pas, sans engagement."
            else:
                core = "Je reste à votre disposition pour échanger quand cela vous convient."
            parts = ["Bonjour, merci pour votre message.", core]
            if not informed and mentions:
                parts.append(mentions.group(1))
            body = " ".join(parts) + " Cordialement."
        return json.dumps({"corps": body, "a_verifier": a_verifier}, ensure_ascii=False)

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
