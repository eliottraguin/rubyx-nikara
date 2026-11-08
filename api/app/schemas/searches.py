"""Contrats des recherches du bot `scout` (docs/CONTRACTS.md §11). Textes en français courant."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SearchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # jamais de prospect, de coût ni de score envoyé par le navigateur
    planet_id: str = Field(min_length=1, max_length=40, description="Lieu à visiter (liste blanche : `data/planets/`)")
    precision: str | None = Field(default=None, description="Facultatif, 300 caractères au plus : texte brut traité comme une donnée")


class SearchAddedOut(BaseModel):
    prospect_id: str
    entreprise: str
    source_ref: str
    etiquette: Literal["correspond", "a_verifier", "hors_cible"] = Field(default="a_verifier", description="Tri de pertinence (aide, pas une note)")
    citation: str | None = Field(default=None, description="Extrait littéral de la source (vérifié par le serveur) ; null sans preuve")


class SearchDiscardedOut(BaseModel):
    source_ref: str | None = Field(description="Référence du lead ; null si le bot n'en a donné aucune")
    entreprise: str | None = Field(description="Nom de l'entreprise si la référence est connue de la source")
    code: str = Field(description="UNVERIFIED | DUPLICATE | CLOSED | STALE | OUT_OF_ZONE | OUT_OF_SECTOR | OUT_OF_SIZE | EXCLUDED | CARNET_FULL | INCOMPLETE")
    raison: str = Field(description="Raison en français courant")


class SearchOut(BaseModel):
    id: str
    planet_id: str
    planet_label: str
    precision: str | None
    status: Literal["PENDING", "RUNNING", "DONE", "FAILED"]
    found: int = Field(description="Leads rapportés par le bot")
    kept: int = Field(description="Ajoutés au carnet")
    discarded: int = Field(description="Écartés par le code (found = kept + discarded)")
    examined: int = Field(description="Enregistrements renvoyés par le lieu")
    profile_version: int
    simule: bool
    action_id: str | None
    matching: int = Field(default=0, description="Prospects ajoutés d'étiquette `correspond`")
    to_check: int = Field(default=0, description="Prospects ajoutés d'étiquette `a_verifier`")
    off_target: int = Field(default=0, description="Prospects ajoutés d'étiquette `hors_cible` (restent au carnet)")
    added: list[SearchAddedOut] = []
    discarded_items: list[SearchDiscardedOut] = []
    error: dict | None = Field(default=None, description="{code, message} si la recherche a échoué ; rien n'a été ajouté")
    created_at: datetime
    finished_at: datetime | None


class SearchListOut(BaseModel):
    items: list[SearchOut]
    searches_left_today: int = Field(description="Recherches restantes aujourd'hui (plafond technique, UTC)")


class PlanetView(BaseModel):
    id: str
    label: str
    status: Literal["AVAILABLE", "LOCKED"]
    reason: str | None = Field(default=None, description="Phrase simple si le lieu est verrouillé ; sinon null")
