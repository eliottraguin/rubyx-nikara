"""Fiche entreprise et cible (docs/CONTRACTS.md §1). Les bornes ne sont PAS ici : elles viennent de
`data/profile/target_profile_v1.json` (contrôlées par `services/profile.py`)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TargetSize(BaseModel):
    model_config = ConfigDict(extra="forbid")

    effectif_min: int
    effectif_max: int


class ProfileIn(BaseModel):
    """Corps de `PUT /api/profile` : remplace la fiche courante. Aucun prix, solde ni droit n'est accepté."""

    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1, description="Version courante connue du client ; périmée => VERSION_CONFLICT")
    entreprise_nom: str = ""
    offre: str = ""
    besoin: str = ""
    cible_secteurs: list[str] = Field(default_factory=list)
    cible_zone: list[str] = Field(default_factory=list)
    cible_taille: TargetSize | None = None
    cible_fonctions: list[str] = Field(default_factory=list)
    exclusions: list[str] = Field(default_factory=list)
    ton: str | None = Field(default=None, description="Valeur de l'énumération de la spécification ; défaut de la spécification si absent")


class TargetProfileOut(BaseModel):
    profile_version: int
    entreprise_nom: str
    offre: str
    besoin: str
    cible_secteurs: list[str]
    cible_zone: list[str]
    cible_taille: TargetSize | None
    cible_fonctions: list[str]
    exclusions: list[str]
    ton: str
    modifie_le: datetime
    complete: bool  # vrai si les champs « requis en mode Réel » (offre, secteurs, zone) sont renseignés
