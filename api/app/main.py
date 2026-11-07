"""Point d'entrée FastAPI : `uvicorn app.main:app`."""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import CONTRACTS_VERSION, __version__
from .config import ConfigError, Settings
from .db import make_engine, make_session_factory, run_migrations
from .errors import install_error_handlers
from .llm import get_adapter
from .logging_config import configure_logging, request_log_middleware
from .routes import actions, agents, attempts, demo, health, messages, missions, ops, sessions, stubs
from .rules import load_rules
from .services.actions import ActionEngine
from .services.evaluation import evaluate_submission, recover_pending
from .services.actions_reconcile import reconcile


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()  # valide l'environnement : ConfigError lisible si incohérent
    settings.validate()
    configure_logging(settings)
    rules = load_rules(settings.data_dir, settings.rules_version)
    llm = get_adapter(settings.llm_provider)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        run_migrations(settings)  # idempotent ; la base est créée/à jour avant la 1re requête
        engine = make_engine(settings)
        app.state.engine = engine
        app.state.session_factory = make_session_factory(engine)
        app.state.actions = ActionEngine(app.state.session_factory, app.state.rules, app.state.llm)
        reconcile(app.state.actions)  # RUNNING interrompus et réservations expirées (BE04)
        if settings.auto_evaluate:  # BE06 : évaluateur serveur + reprise des livraisons restées EVALUATING
            eng = app.state.actions
            app.state.evaluator = lambda submission_id: evaluate_submission(eng, settings.data_dir, submission_id)
            recover_pending(eng, settings.data_dir)
        logging.getLogger("rubix").info(
            "startup", extra={"event": "startup", "provider": settings.llm_provider, "rules_version": rules.version, "db": "ok"}
        )
        yield
        engine.dispose()

    app = FastAPI(
        title="API du jeu de gestion avec agents IA",
        version=__version__,
        description=f"Contrats v{CONTRACTS_VERSION} (docs/CONTRACTS.md). Le backend est seul maître de l'argent, des quotas et des droits.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.rules = rules
    app.state.llm = llm

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Content-Type", "Idempotency-Key"],
        )
    request_log_middleware(app)
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(agents.router)
    app.include_router(messages.router)
    app.include_router(actions.router)
    app.include_router(missions.router)
    app.include_router(attempts.router)
    app.include_router(demo.router)
    app.include_router(ops.router)
    app.include_router(stubs.router)
    return app


def _module_app() -> FastAPI:
    """`uvicorn app.main:app` : une configuration invalide arrête le processus avec un message lisible (code 2), sans trace."""
    try:
        return create_app()
    except ConfigError as exc:
        sys.stderr.write(f"{exc}\n")
        raise SystemExit(2) from None


app = _module_app()
