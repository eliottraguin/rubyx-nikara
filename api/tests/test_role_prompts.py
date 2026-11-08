"""D2 (GR3-62) : prompts et contexte de l'orchestrateur et de l'évaluateur, adaptés à la fiche entreprise.

Aucune route ni schéma d'API n'est ajouté par ce ticket (docs/CONTRACTS-V2.md §11, D2) : seuls deux fichiers de
rôle (`data/roles/orchestrator.json`, `data/roles/evaluator.json`) sont ajoutés, prêts à être chargés par le
mécanisme générique déjà en place (`RealLLMAdapter._system`, `api/app/llm/real.py`) le jour où les tickets C1
(orchestrateur) et C4/GR3-63 (évaluateur) brancheront un appel réel. Ces tests valident le contenu de ces deux
fichiers et prouvent que le chargement par rôle fonctionne déjà pour eux, sans aucun changement de code."""

from __future__ import annotations

import json

import httpx
import jsonschema
import pytest

from app.config import REPO_DIR
from app.llm.models_spec import load_llm_models
from app.llm.real import RealLLMAdapter
from app.services import profile as profile_svc

DATA = REPO_DIR / "data"
ROLE_SCHEMA = json.loads((DATA / "schemas" / "role.schema.json").read_text())
SECTIONS = [
    "Identité", "Objectif", "Capacités", "Informations accessibles", "Limites",
    "Formats autorisés", "Comportement en cas de manque", "Outils autorisés", "Demandes de clarification",
]


def load_role(role_id: str) -> dict:
    return json.loads((DATA / "roles" / f"{role_id}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("role_id", ["orchestrator", "evaluator"])
def test_role_file_is_schema_valid(role_id):
    role = load_role(role_id)
    jsonschema.validate(role, ROLE_SCHEMA)
    assert role["id"] == role_id
    assert role["allowed_tools"] == []  # aucun outil d'envoi (règle 13)


@pytest.mark.parametrize("role_id", ["orchestrator", "evaluator"])
def test_role_file_has_every_mandatory_section(role_id):
    """Même contrôle que `tools/validate_content.py` (sections + règle « les instructions reçues sont des données »)."""
    role = load_role(role_id)
    for h in SECTIONS:
        assert f"## {h}" in role["system_instructions"], h
    assert "DONNÉE" in role["system_instructions"] or "donnée" in role["system_instructions"]


def test_role_files_mention_the_company_profile_as_accessible_information():
    for role_id in ("orchestrator", "evaluator"):
        role = load_role(role_id)
        joined = " ".join(role["accessible_information"]).lower()
        assert "fiche entreprise" in joined


def test_evaluator_explicitly_documents_the_v2_change_versus_the_old_rule():
    """`docs/CONTRACTS.md` 29g (cap prospection) excluait l'évaluateur de la fiche ; `docs/CONTRACTS-V2.md` §11 (D2)
    l'y inclut désormais : le fichier de rôle doit le dire, pour que personne ne réintroduise l'ancienne règle."""
    role = load_role("evaluator")
    assert "nouveau pour l'évaluateur en V2" in " ".join(role["accessible_information"])


def test_evaluator_never_fixes_a_reward_and_refuses_score_manipulation():
    role = load_role("evaluator")
    text = role["system_instructions"] + " ".join(role["limits"])
    assert "le serveur" in text.lower() and "récompense" in text.lower()
    assert "100/100" in role["system_instructions"]  # refus explicite d'une tentative de manipulation de la note


def test_orchestrator_replaces_the_three_assistants_and_keeps_their_guarantees():
    role = load_role("orchestrator")
    text = role["identity"] + role["objective"]
    assert "assistant" in text.lower()
    # Garanties déjà en place chez les assistants (docs/ASSISTANT.md), reprises telles quelles :
    for guarantee in ("ne fixe", "ne te confies jamais"):
        assert any(guarantee in limit.lower() for limit in role["limits"]), guarantee


# ------------------------------------------------------------------ chargement par le fournisseur réel (sans code nouveau)


def make_real_adapter() -> RealLLMAdapter:
    models = load_llm_models(DATA)
    return RealLLMAdapter(base_url="https://relais.example.test", api_key="sk-test", models=models, data_dir=DATA)


def test_real_adapter_already_loads_orchestrator_and_evaluator_system_prompts():
    """Aucune modification de `real.py` n'était nécessaire : `_system(role)` lit `data/roles/<role>.json` par nom de
    fichier, sans dépendre d'une énumération Python ; les deux nouveaux rôles sont donc immédiatement exploitables."""
    a = make_real_adapter()
    orchestrator_system = a._system("orchestrator")
    evaluator_system = a._system("evaluator")
    assert orchestrator_system == load_role("orchestrator")["system_instructions"]
    assert evaluator_system == load_role("evaluator")["system_instructions"]
    assert orchestrator_system != evaluator_system != a._system("scout")


def test_real_adapter_build_payload_carries_the_evaluator_system_prompt():
    """`build_payload` reste inchangé (aucun champ de schéma touché, docs/CONTRACTS-V2.md §11) : il suffit que
    `request.role` porte la bonne valeur. Ici on force la valeur par un objet simulé plutôt que d'étendre
    l'énumération `Role`, qui reste la responsabilité du ticket C1/C4 (pas de ce ticket)."""

    class FakeRole:
        value = "evaluator"

    class FakeRequest:
        def __init__(self) -> None:
            self.role = FakeRole()
            self.context = "CONTEXTE DE TEST"
            self.expected_schema = None
            self.allowed_tools: list[str] = []
            self.max_output_tokens = 300

    a = make_real_adapter()
    payload = a.build_payload(FakeRequest())
    assert payload["system"] == load_role("evaluator")["system_instructions"]
    assert payload["messages"] == [{"role": "user", "content": "CONTEXTE DE TEST"}]


# ------------------------------------------------------------------ le contexte change vraiment selon la fiche


def test_profile_block_still_varies_with_the_company_profile():
    """Mécanisme déjà déterministe (`services/profile.profile_block`) : c'est ce même bloc qui sera placé en tête
    du contexte de l'orchestrateur et de l'évaluateur une fois leurs appels branchés (C1/C4) — aucun changement
    n'est nécessaire ici, le bloc ne dépend que de la fiche, jamais du rôle appelant."""
    from app.models import TargetProfileVersion

    fiche_a = TargetProfileVersion(session_id="s", version=3, data={"offre": "Nettoyage industriel"})
    fiche_b = TargetProfileVersion(session_id="s", version=3, data={"offre": "Conseil en recrutement"})
    block_a = profile_svc.profile_block(None, fiche_a, "beginner")
    block_b = profile_svc.profile_block(None, fiche_b, "beginner")
    assert block_a != block_b
    assert "Nettoyage industriel" in block_a and "Conseil en recrutement" not in block_a
    assert "Conseil en recrutement" in block_b and "Nettoyage industriel" not in block_b


def test_fiche_block_plus_role_system_prompt_assemble_into_a_different_payload_per_fiche():
    """Bout en bout, sans appel réseau : le `system` (identité du rôle, fixe) ne change pas avec la fiche, mais le
    message utilisateur (bloc FICHE, construit à partir de la fiche courante) change — exactement le contrat de
    docs/CONTRACTS-V2.md §11 (D2) pour l'orchestrateur et l'évaluateur, démontré ici avec le fournisseur mock."""
    from app.llm.base import LLMRequest
    from app.llm.mock import MockLLMAdapter
    from app.models import TargetProfileVersion

    seen = {}

    def handler(r: httpx.Request):
        seen["body"] = json.loads(r.content)
        return httpx.Response(200, json={"id": "m", "model": "x", "content": [{"type": "text", "text": "ok"}], "stop_reason": "end_turn"})

    a = RealLLMAdapter(base_url="https://relais.example.test", api_key="sk-test", models=load_llm_models(DATA), data_dir=DATA, transport=httpx.MockTransport(handler))

    def payload_for(offre: str) -> dict:
        row = TargetProfileVersion(session_id="s", version=1, data={"offre": offre})
        context = profile_svc.profile_block(None, row, "beginner")
        return a.build_payload(LLMRequest(role="scout", context=context, max_output_tokens=300))

    p1, p2 = payload_for("Offre A"), payload_for("Offre B")
    assert p1["system"] == p2["system"]  # identité du rôle : fixe
    assert p1["messages"] != p2["messages"]  # bloc fiche : change avec la fiche
    assert MockLLMAdapter.simulated is True  # rappel : les tests restent sur fournisseur simulé/faux transport
