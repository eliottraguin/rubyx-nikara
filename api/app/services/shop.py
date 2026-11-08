"""Catalogue de la boutique (docs/CONTRACTS-V2.md §2, ticket C2) : prix, palier, prérequis lus dans
`data/shop/*.json` et `data/agents/tiers.json`, **jamais dans le code**. Chargé une fois au démarrage."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..rules_v2 import RulesV2
from ..schemas.agent_instances import ShopItemEffects, ShopItemOut, ShopOut
from ..schemas.common import HangarRole
from . import agent_instances as ai
from . import clients, hangar

ROLES: tuple[str, ...] = ("scout", "triage", "replier", "ads")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ShopItem(_Strict):
    id: str
    tier: int = Field(ge=1)
    label: str
    price: int = Field(ge=0)
    effects: ShopItemEffects
    unlock_clients: int | None = None


class RoleCatalog(_Strict):
    role: HangarRole
    items: list[ShopItem] = Field(min_length=1)


class ShopCatalog:
    """Items par rôle (triés par palier) et palier maximal vendu par rôle (`data/agents/tiers.json`)."""

    def __init__(self, roles: dict[str, RoleCatalog], max_tier: dict[str, int]):
        self.roles = roles
        self.max_tier = max_tier

    def items(self) -> list[tuple[str, ShopItem]]:
        return [(role, item) for role in ROLES for item in self.roles[role].items]

    def find(self, item_id: str) -> tuple[str, ShopItem] | None:
        for role, item in self.items():
            if item.id == item_id:
                return role, item
        return None

    def role_max_tier(self, role: str) -> int:
        return self.max_tier[role]


def load_shop_catalog(data_dir: Path) -> ShopCatalog:
    roles: dict[str, RoleCatalog] = {}
    for role in ROLES:
        doc = json.loads((data_dir / "shop" / f"{role}.json").read_text(encoding="utf-8"))
        catalog = RoleCatalog.model_validate(doc)
        if catalog.role.value != role:
            raise ValueError(f"data/shop/{role}.json déclare le rôle {catalog.role.value}")
        roles[role] = catalog
    tiers_doc = json.loads((data_dir / "agents" / "tiers.json").read_text(encoding="utf-8"))
    max_tier = {role: tiers_doc["roles"][role]["max_tier"] for role in ROLES}
    return ShopCatalog(roles, max_tier)


def _item_unlocked(rules_v2: RulesV2, rule, mode: str, clients_obtained: int, item: ShopItem) -> bool:
    if item.unlock_clients is None or hangar.waived(rules_v2, rule, mode):
        return True
    return clients_obtained >= item.unlock_clients


def shop_view(db: Session, rules_v2: RulesV2, catalog: ShopCatalog, mode: str, session_id: str) -> ShopOut:
    n = clients.obtained_count(db, session_id)
    counts = {role: ai.count_by_role(db, session_id, role) for role in ROLES}
    items: list[ShopItemOut] = []
    for role in ROLES:
        rule = rules_v2.agent(role)
        role_unlocked = hangar.is_unlocked(rules_v2, rule, mode, n)
        for item in catalog.roles[role].items:
            item_unlocked = _item_unlocked(rules_v2, rule, mode, n, item)
            buyable = item_unlocked and role_unlocked and counts[role] < rules_v2.agents_max_instances_per_role
            items.append(
                ShopItemOut(
                    id=item.id, role=HangarRole(role), tier=item.tier, label=item.label, price=item.price,
                    effects=item.effects, unlock_clients=item.unlock_clients, unlocked=item_unlocked, buyable=buyable,
                )
            )
    return ShopOut(items=items, owned_counts=counts)
