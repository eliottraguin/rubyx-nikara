"""Vérification de l'état du service (santé, schéma, règles, fournisseur) sans appel réseau. Utilisée par `GET /api/ready` et `check`."""

from __future__ import annotations

from typing import Any

from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text

from ..config import Settings
from ..db import alembic_config
from ..models import Base


def expected_head() -> str | None:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def check_state(engine: Engine, settings: Settings, rules: Any, llm: Any) -> dict[str, Any]:
    """Retourne {ok, checks:{db, schema, rules, provider}} ; chaque contrôle = {ok, detail}. Aucun secret ni chemin."""
    checks: dict[str, dict[str, Any]] = {}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            checks["db"] = {"ok": True, "detail": "accessible"}
            current = MigrationContext.configure(conn).get_current_revision()
            head = expected_head()
            tables = set(inspect(conn).get_table_names())
            missing = sorted(set(Base.metadata.tables) - tables)
            if current != head:
                checks["schema"] = {"ok": False, "detail": f"révision {current or 'aucune'}, attendue {head}"}
            elif missing:
                checks["schema"] = {"ok": False, "detail": f"tables manquantes : {', '.join(missing)}"}
            else:
                checks["schema"] = {"ok": True, "detail": f"révision {current}, {len(Base.metadata.tables)} tables"}
    except Exception:  # noqa: BLE001 - le détail (chemin, message SQL) ne sort jamais de l'API
        checks.setdefault("db", {"ok": False, "detail": "inaccessible"})
        checks.setdefault("schema", {"ok": False, "detail": "non vérifiable"})
    checks["rules"] = (
        {"ok": True, "detail": f"{rules.version} ({len(rules.agents)} agents, {len(rules.missions)} missions)"}
        if rules is not None
        else {"ok": False, "detail": "non chargées"}
    )
    provider_ok = llm is not None and llm.name == settings.llm_provider
    checks["provider"] = {
        "ok": provider_ok,
        "detail": f"{llm.name} ({'simulé' if llm.simulated else 'réel, non sondé'})" if llm is not None else "non configuré",
    }
    return {"ok": all(c["ok"] for c in checks.values()), "checks": checks}
