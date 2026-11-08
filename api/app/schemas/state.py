"""État renvoyé à l'UI (GET /api/state, POST /api/sessions)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .agent_instances import AgentInstanceSummaryOut, ShopItemOut
from .common import Mode, Role
from .profile import TargetProfileOut
from .searches import PlanetView


class CompanyOut(BaseModel):
    name: str
    profile: str | None = None


class SessionInfo(BaseModel):
    id: str
    mode: Mode
    company: CompanyOut
    state: str
    seed: int
    rules_version: str
    created_at: datetime


class Balance(BaseModel):
    booked: int  # solde comptabilisé
    reserved: int  # réservations actives
    available: int  # booked - reserved


class HangarAgentView(BaseModel):
    """Rôle du hangar du cap prospection (`scout` / `triage` / `replier` / `ads`), prix et déblocage décidés par le serveur."""

    role: Role
    label: str
    section: Literal["prospection", "clients", "pub"]
    price: int
    owned: bool
    unlock_clients: int | None  # nombre de clients obtenus qui débloque le rôle ; null = disponible d'emblée
    unlock_condition: str | None  # phrase simple pour le joueur (« Obtenez 2 clients pour débloquer ce rédacteur ») ; null si disponible
    clients_condition_waived: bool  # vrai en mode Réel pour triage/replier/ads : seule la condition de prix reste
    unlocked: bool  # condition de clients remplie (ou levée) ; l'achat reste contrôlé par le serveur (prix, ROLE_LOCKED)


class LLMInfo(BaseModel):
    provider: str
    simulated: bool  # true => badge « mode simulé » obligatoire


class ActiveActionView(BaseModel):
    """Action non terminée de la partie (à suivre via `GET /api/actions/{id}`, ou à confirmer / reprendre pour un plan)."""

    id: str
    type: str  # search | prospect_profile | … | assistant_plan
    status: str  # PENDING | RESERVED | RUNNING | AWAITING_CONFIRMATION | PARTIAL
    created_at: datetime
    updated_at: datetime


class BuildingOut(BaseModel):
    """Immeuble du joueur, calculé par le serveur depuis le nombre de clients obtenus (ne baisse jamais)."""

    level: int
    clients_obtained: int
    next_level_at: int | None  # nombre de clients obtenus du prochain niveau ; null au niveau maximal


class GameState(BaseModel):
    session: SessionInfo
    balance: Balance
    hangar: list[HangarAgentView] = []  # hangar du cap prospection : scout, triage, replier, ads (+ assistants)
    agents: list[AgentInstanceSummaryOut] = []  # instances possédées (docs/CONTRACTS-V2.md §2), tous rôles
    shop_catalog: list[ShopItemOut] = []  # catalogue de la boutique, identique à `GET /api/shop` (lecture seule ici)
    active_actions: list[ActiveActionView] = []
    target_profile: TargetProfileOut  # fiche entreprise et cible courante (versionnée ; PUT /api/profile)
    clients_obtained: int  # prospects distincts devenus clients et payés (source : ledger) ; pilote déblocages et immeuble
    building: BuildingOut
    planets: list[PlanetView] = []  # lieux de la ville : disponible ou verrouillé (avec la raison), calculé par le serveur
    llm: LLMInfo
    contracts_version: str


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")  # le client ne peut envoyer ni solde, ni score, ni droits

    company_name: str = Field(min_length=1, max_length=60)
    mode: Mode
    profile: str | None = Field(default=None, max_length=200)

    @field_validator("company_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("le nom ne peut pas être vide")
        return v


class HealthOut(BaseModel):
    status: Literal["ok"]
    version: str
    contracts_version: str
    rules_version: str
    llm_provider: str
    db: Literal["ok"]
