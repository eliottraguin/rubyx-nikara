"""Schémas de la boutique et des instances d'agent (docs/CONTRACTS-V2.md §2, ticket C2)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .common import HangarRole


class ShopItemEffects(BaseModel):
    duration_multiplier: float = Field(gt=0)
    quality_bonus: int = Field(ge=0)


class ShopItemOut(BaseModel):
    id: str
    role: HangarRole
    tier: int
    label: str
    price: int
    effects: ShopItemEffects
    unlock_clients: int | None
    unlocked: bool
    buyable: bool


class ShopOut(BaseModel):
    items: list[ShopItemOut]
    owned_counts: dict[str, int]


class ShopPurchaseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # aucun prix ni palier choisi par le navigateur

    item_id: str = Field(min_length=1, max_length=64)


class AgentConfigOut(BaseModel):
    version: int
    instructions: str
    context_note: str | None
    tools: list[str]
    tier_cap: int


class AgentInstanceOut(BaseModel):
    id: str
    role: HangarRole
    tier: int
    status: str
    label: str | None
    active_config_id: str
    config: AgentConfigOut
    price_paid: int
    purchased_at: datetime


class AgentInstanceSummaryOut(BaseModel):
    """Vue courte d'une instance, utilisée dans `GameState.agents` (docs/CONTRACTS-V2.md §8)."""

    id: str
    role: HangarRole
    tier: int
    status: str
    label: str | None
    active_config_id: str
    config_version: int


class AgentInstancesOut(BaseModel):
    items: list[AgentInstanceOut]


class AgentInstancePatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # le joueur ne modifie que le surnom

    label: str | None = Field(max_length=40)
