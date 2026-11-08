"""Plans simulés des assistants personnels : déterministes, sans réseau. Ne lit que `metadata["assistant"]`
(`assistant`, `message`, `targets` = {genre: [{id, label}]}, `purpose`) ; produit uniquement des cibles de la liste fournie.

Marqueurs de test dans la demande : `#invalide` (jamais un JSON valide) ; `#reparable` (premier appel invalide, la
réparation réussit) ; `#hors-liste` (propose une cible absente de la liste) ; `#trop` (4 étapes)."""

from __future__ import annotations

import json
import unicodedata


def _norm(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def _step(kind: str, target: dict, instruction: str = "") -> dict:
    return {"type": kind, "target_id": target["id"], "instruction": instruction}


def _first(targets: dict, genre: str, n: int) -> list[dict]:
    return list(targets.get(genre, []))[:n]


def build_plan_json(hints: dict) -> str:
    msg = _norm(hints.get("message", ""))
    repair = str(hints.get("purpose", "")).endswith("repair")
    if "#invalide" in msg or ("#reparable" in msg and not repair):
        return "Je vais m'en occuper, voici mon avis."  # pas du JSON : provoque une réparation
    targets = hints.get("targets", {})
    many = any(w in msg for w in ("toutes", "tous", "chaque"))
    n = 3 if many else 1
    assistant = hints.get("assistant")
    steps: list[dict] = []
    if assistant == "assistant_clients":
        for c in _first(targets, "conversation", n):
            if "repon" not in msg or "resum" in msg:
                steps.append(_step("conversation_triage", c, "Résume en trois lignes ce que le client demande."))
            if "repon" in msg:
                steps.append(_step("conversation_reply", c, "Réponds poliment et propose un échange."))
        summary = "Je résume les conversations demandées puis je prépare des brouillons de réponse." if steps else "Vous n'avez aucune conversation pour l'instant."
    elif assistant == "assistant_pub":
        for k in _first(targets, "campaign", n):
            steps.append(_step("ad_campaign", k, "Prépare un kit clair et sobre."))
        summary = "Je prépare le kit de campagne." if steps else "Vous n'avez aucune campagne : créez-en une d'abord."
    else:
        if "fiche" in msg:
            steps += [_step("prospect_profile", p) for p in _first(targets, "prospect", n)]
        elif "message" in msg:
            steps += [_step("prospect_message", p) for p in _first(targets, "prospect", n)]
        else:
            steps += [_step("scout_search", p) for p in _first(targets, "planet", 1)]
        summary = "Je lance la recherche ou je prépare les documents demandés." if steps else "Je n'ai aucun lieu ni prospect à utiliser pour l'instant."
    if "#hors-liste" in msg:
        steps = [{"type": steps[0]["type"] if steps else "conversation_triage", "target_id": "inconnu_000", "instruction": ""}]
    if "#trop" in msg and steps:
        steps = [steps[0] | {"target_id": steps[0]["target_id"]} for _ in range(4)]
    return json.dumps({"summary": summary, "steps": steps}, ensure_ascii=False)
