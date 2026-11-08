"""Fournisseur simulé : déterministe, sans réseau (même entrée => même sortie)."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata

from .base import LLMAdapter, LLMRequest, LLMResponse, LLMStatus, Usage

_LABELS = {
    "scout": "éclaireur",
    "triage": "trieur de boîte",
    "replier": "rédacteur",
    "ads": "directeur de campagne",
    "assistant_prospection": "assistant prospection",
    "assistant_clients": "assistant clients",
    "assistant_pub": "assistant pub",
}

# Messagerie simulée : blocs de données délimités (voir services/conversations.py)
_THREAD = re.compile(r"<<<FIL nonce=(\w+)>>>\n(.*?)\n<<<FIN FIL nonce=\1>>>", re.DOTALL)
_MENTIONS = re.compile(r"\[MENTIONS STANDARD\] origine=.*? \| opposition=(.*?) \| client déjà informé=(oui|non)")
_SYNTH = re.compile(r"\[SYNTHÈSE DE LA CONVERSATION\] intention=(\w+)")
_OPTOUT_HINTS = ("arretez", "stop", "desinscri", "desabonn", "ne plus recevoir", "ne m'ecrivez plus", "retirez moi", "unsubscribe")

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
        if title == "AssistantPlan":  # plan simulé d'un assistant personnel : uniquement des cibles de la liste fournie
            from .mock_assistant import build_plan_json

            return self._response(request, build_plan_json({**request.metadata["assistant"], "purpose": request.purpose}), digest)
        if title == "ScoutReport":  # rapport simulé du bot de recherche : uniquement des enregistrements fournis
            from .mock_scout import build_report_json

            return self._response(request, build_report_json({**request.metadata["scout"], "purpose": request.purpose}), digest)
        if title == "RelevanceTriage":  # tri de pertinence simulé : étiquettes et citations d'après les enregistrements fournis
            from .mock_relevance import build_triage_json

            return self._response(request, build_triage_json({**request.metadata["relevance"], "purpose": request.purpose}), digest)
        if title in ("PromptEvaluation", "NegotiationEvaluation"):  # évaluateur simulé (rôle `evaluator`, GR3-63/D3) : note la consigne seule ou le fil côté joueur
            from .mock_evaluator import build_evaluation_json

            return self._response(request, build_evaluation_json(request.metadata.get("evaluator", {}), title), digest)
        if title == "AdKit":  # kit de campagne simulé (rôle `ads`) : uniquement des éléments de la fiche entreprise
            from .mock_ads import build_kit_json

            return self._response(request, build_kit_json(request.metadata["ads"]), digest)
        if title in ("ProspectFiche", "ProspectMessage"):  # fiche client / premier message simulés (rôle `replier`) : uniquement des données transmises
            from .mock_prospect import build_fiche_json, build_message_json

            meta = request.metadata["prospect_draft"]
            return self._response(request, (build_fiche_json if title == "ProspectFiche" else build_message_json)(meta), digest)
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
