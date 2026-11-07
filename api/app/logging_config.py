"""Journaux structurés (une ligne JSON par événement), sans secrets ni contenus de prompts.

Règle : on ne journalise que des métadonnées (méthode, chemin sans paramètres, statut, durée, identifiant de requête).
Jamais d'en-tête, de cookie, de corps de requête, de prompt, de réponse de modèle ni de clé."""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import UTC, datetime

from .config import Settings

# Clés d'`extra=` autorisées dans les journaux ; tout le reste est ignoré (liste blanche).
_ALLOWED = {"event", "method", "path", "status", "duration_ms", "request_id", "detail", "count", "provider", "rules_version", "db"}
_SENSITIVE = ("secret", "token", "cookie", "authorization", "api_key", "prompt", "password")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in _ALLOWED:
            if key in record.__dict__ and not any(w in key for w in _SENSITIVE):
                data[key] = record.__dict__[key]
        if record.exc_info:  # type d'exception seulement : la trace peut citer des valeurs
            data["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(data, ensure_ascii=False, default=str)


def configure_logging(settings: Settings) -> None:
    """Configure le logger `rubix` (idempotent). Les autres loggers gardent leur configuration."""
    logger = logging.getLogger("rubix")
    logger.setLevel(settings.log_level)
    logger.propagate = False
    for h in list(logger.handlers):
        if getattr(h, "_rubix", False):
            logger.removeHandler(h)
    handler = logging.StreamHandler(sys.stderr)
    handler._rubix = True  # type: ignore[attr-defined]
    handler.setFormatter(
        JsonFormatter() if settings.log_format == "json" else logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    logger.addHandler(handler)


def request_log_middleware(app) -> None:  # noqa: ANN001
    """Ajoute le journal d'accès structuré (chemin sans query string) et l'en-tête X-Request-Id."""
    from uuid import uuid4

    log = logging.getLogger("rubix.http")

    @app.middleware("http")
    async def _access_log(request, call_next):  # noqa: ANN001, ANN202
        rid = uuid4().hex[:12]
        start = time.monotonic()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-Id"] = rid
            return response
        finally:
            log.info(
                "request",
                extra={
                    "event": "request",
                    "method": request.method,
                    "path": request.url.path,
                    "status": status,
                    "duration_ms": int((time.monotonic() - start) * 1000),
                    "request_id": rid,
                },
            )
