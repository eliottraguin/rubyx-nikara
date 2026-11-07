"""Carnet de prospection (docs/CONTRACTS.md « 2. Carnet de prospection »). Le navigateur n'envoie que des références
(ajout) ou `statut`/`notes` (modification) : jamais le contenu d'un prospect."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")  # un champ inconnu (ex. `entreprise`) est refusé, jamais ignoré en silence


class ProspectAddIn(_In):
    expedition_id: str = Field(min_length=1, max_length=64, description="Expédition (tentative) d'origine")
    rapport_version_id: str = Field(min_length=1, max_length=64, description="Version de rapport (livrable d'un agent) de cette expédition")
    positions: list[int] = Field(min_length=1, max_length=100, description="Positions (à partir de 0) des leads du rapport")


class ProspectPatchIn(_In):
    version: int = Field(ge=1, description="Version du prospect lue par le joueur (concurrence optimiste)")
    statut: str | None = Field(default=None, max_length=32, description="Un des statuts de `rules_v2.prospect_statuses`")
    notes: str | None = Field(default=None, description="Texte brut, borné par `limits.notes_max_chars`")


class CanalOut(BaseModel):
    type: Literal["email_generique", "formulaire", "adresse", "telephone_standard", "reseau_pro"]
    valeur: str


class ProspectOut(BaseModel):
    id: str
    entreprise: str
    contact_nom: str | None = None
    contact_fonction: str | None = None
    canal: CanalOut | None = None
    source: str
    source_ref: str
    raisons_fit: list[str]
    signal: str | None = None
    pertinence: int = Field(ge=0, le=100, description="Calculée par le serveur")
    fiabilite: Literal["verifie", "partiel", "simule"]
    simule: bool
    statut: str
    notes: str
    collecte_le: str | None = Field(default=None, description="Date de collecte de l'enregistrement de la source (ISO 8601)")
    expedition_id: str
    rapport_version_id: str
    profile_version: int
    possible_doublon: bool = Field(description="Même entreprise déjà au carnet via une autre source")
    cree_le: datetime
    modifie_le: datetime
    contacte_le: datetime | None = None
    derniere_activite_le: datetime
    version: int


class StatutEvent(BaseModel):
    statut: str
    le: datetime


class ProspectDetailOut(ProspectOut):
    instantane_source: dict = Field(description="Copie minimisée (liste blanche de la source) de l'enregistrement renvoyé")
    historique_statut: list[StatutEvent]
    fiches: list[dict] = Field(default_factory=list, description="Fiches clients (jalon J ; vide pour l'instant)")
    brouillons: list[dict] = Field(default_factory=list, description="Brouillons de premier message (jalon K ; vide pour l'instant)")


class RefusedLead(BaseModel):
    position: int
    code: Literal["LEAD_UNVERIFIED"]


class ProspectAddOut(BaseModel):
    added: list[ProspectOut]
    already_present: list[str] = Field(description="Identifiants des prospects déjà au carnet (dédoublonnage `(source, source_ref)`)")
    refused: list[RefusedLead]


class ProspectListOut(BaseModel):
    items: list[ProspectOut]
    next_cursor: str | None = None
    counts: dict[str, int] = Field(description="Prospects par statut, sur tout le carnet (indépendant des filtres)")
    total: int = Field(description="Nombre de prospects au carnet (indépendant des filtres)")
