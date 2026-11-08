"""Fiche client et premier message d'un prospect (docs/CONTRACTS.md §3). Tous les textes sont des contenus **non fiables** :
l'interface les rend en texte, jamais en HTML. Aucune adresse ni aucun numéro n'apparaît ici (contrôle par code)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .actions import ActionOut
from .conversations import Controle


class DraftActionIn(BaseModel):
    """Corps (facultatif) de `profile` et `message` : consigne du joueur (donnée, jamais une consigne système)."""

    model_config = ConfigDict(extra="forbid")

    instruction: str | None = Field(default=None, description="Consigne facultative (`limits.player_instruction_max_chars`, vérifié par le serveur)")
    profile_version: int | None = Field(default=None, ge=1, description="Version de la fiche entreprise lue par le joueur ; périmée : `VERSION_CONFLICT`")


class Raison(BaseModel):
    texte: str
    critere: str = Field(description="Champ de la fiche entreprise et cible qui justifie la raison (ex. `cible_secteurs`)")
    champ: str = Field(description="Champ de l'instantané du prospect (ou du prospect) dont la raison est tirée (ex. `secteur`)")


class FicheClient(BaseModel):
    resume: str = Field(max_length=600)
    pourquoi_ce_prospect: list[Raison] = Field(min_length=1, max_length=5)
    points_d_accroche: list[str] = Field(max_length=5, description="1 à 5 attendus (contrôle non essentiel : au-delà de 5, tronqué)")
    a_verifier: list[str] = Field(max_length=8)
    sources: list[str] = Field(description="`source_ref` de l'instantané du prospect")


class Brouillon(BaseModel):
    canal_cible: Literal["email_generique", "formulaire", "adresse", "telephone_standard", "reseau_pro"] = Field(description="Type de canal seulement, jamais sa valeur")
    objet: str = Field(max_length=90)
    corps: str
    mentions: list[Literal["origine", "opposition"]] = Field(description="Mentions détectées par le code dans le corps")


class ProspectDraftOut(BaseModel):
    id: str
    prospect_id: str
    kind: Literal["fiche", "message"]
    numero: int = Field(description="Numéro de version, par prospect et par type")
    parent_id: str | None = Field(description="Version dont celle-ci est la copie éditée par le joueur")
    auteur: Literal["agent", "joueur"]
    fiche: FicheClient | None = None
    message: Brouillon | None = None
    controles: list[Controle]
    consigne: str | None = None
    profile_version: int
    simule: bool
    action_id: str | None
    created_at: datetime


class ProspectDraftsOut(BaseModel):
    fiches: list[ProspectDraftOut]
    messages: list[ProspectDraftOut]
    quota_restant: dict[str, int] = Field(description="Générations restantes par action : `prospect_profile`, `prospect_message`")
    couts: dict[str, int] = Field(default_factory=dict, description="Prix d'une génération réussie par action (lu dans les règles) : `prospect_profile`, `prospect_message`")


class ProspectActionOut(ActionOut):
    """`ActionOut` + la version créée (fiche ou brouillon) et ses contrôles par code. Rien n'est envoyé."""

    prospect_id: str | None = None
    version: ProspectDraftOut | None = None
    pending_cost: int | None = None


class DraftEditIn(BaseModel):
    """Copie éditée par le joueur. Fiche : `resume`, `points_d_accroche`, `a_verifier`. Message : `corps`, `objet`.
    Un champ d'un autre type de version est refusé (`INVALID_REQUEST`)."""

    model_config = ConfigDict(extra="forbid")

    resume: str | None = None
    points_d_accroche: list[str] | None = Field(default=None, max_length=5)
    a_verifier: list[str] | None = Field(default=None, max_length=8)
    corps: str | None = None
    objet: str | None = Field(default=None, max_length=90)
