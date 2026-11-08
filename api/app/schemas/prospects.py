"""Carnet de prospection (docs/CONTRACTS.md « 2. Carnet de prospection »). Le navigateur n'envoie que des références
(ajout) ou `statut`/`notes` (modification) : jamais le contenu d'un prospect."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")  # un champ inconnu (ex. `entreprise`) est refusé, jamais ignoré en silence


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
    pertinence_etiquette: Literal["correspond", "a_verifier", "hors_cible"] = Field(
        default="a_verifier", description="Aide au tri du bot (pas une note) ; prospect jamais trié : « a_verifier »"
    )
    pertinence_citation: str | None = Field(default=None, description="Extrait littéral de la source qui justifie l'étiquette (vérifié par le serveur)")
    fiabilite: Literal["verifie", "partiel", "simule"]
    simule: bool
    statut: str
    notes: str
    collecte_le: str | None = Field(default=None, description="Date de collecte de l'enregistrement de la source (ISO 8601)")
    search_id: str = Field(description="Recherche du bot (`/api/searches`) qui a rapporté ce prospect")
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


class ProspectListOut(BaseModel):
    items: list[ProspectOut]
    next_cursor: str | None = None
    counts: dict[str, int] = Field(description="Prospects par statut, sur tout le carnet (indépendant des filtres)")
    total: int = Field(description="Nombre de prospects au carnet (indépendant des filtres)")
