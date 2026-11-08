"""Point d'entrée FastAPI : `uvicorn app.main:app`."""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import CONTRACTS_VERSION, __version__
from .ads_spec import load_ads_spec
from .config import ConfigError, Settings
from .db import make_engine, make_session_factory, run_migrations
from .errors import install_error_handlers
from .llm import get_adapter
from .logging_config import configure_logging, request_log_middleware
from .profile_spec import load_profile_spec
from .routes import (
    actions,
    agents,
    assistant,
    auth,
    campaigns,
    conversations,
    health,
    ops,
    profile,
    prospects,
    searches,
    sessions,
    shop,
)
from .rules import load_rules
from .rules_v2 import load_rules_v2
from .services.actions import ActionEngine
from .services.actions_reconcile import reconcile
from .services.ad_actions import reconcile_ads
from .services.assistant_actions import AssistantEngine, reconcile_assistant
from .services.assistant_actions import load_texts as load_assistant_texts
from .services.campaigns import PubEngine
from .services.messaging_data import load_messaging_data
from .services.planet_source import SimulatedPlanetSource
from .services.prospect_actions import reconcile_prospect_actions
from .services.prospect_lookup import SqlProspectLookup
from .services.search_actions import SearchEngine, reconcile_searches
from .services.shop import load_shop_catalog
from .sources_spec import load_sources_spec


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()  # valide l'environnement : ConfigError lisible si incohérent
    settings.validate()
    configure_logging(settings)
    rules = load_rules(settings.data_dir, settings.rules_version)
    rules_v2 = load_rules_v2(settings.data_dir)  # cap prospection : prix des 4 rôles du hangar, building, limites, rétention
    shop_catalog = load_shop_catalog(settings.data_dir)  # boutique (docs/CONTRACTS-V2.md §2) : data/shop/*.json, data/agents/tiers.json
    profile_spec = load_profile_spec(settings.data_dir)  # bornes de la fiche entreprise et cible
    ads_spec = load_ads_spec(settings.data_dir)  # section Pub : formats, limites, checklist, grille du kit
    sources_spec = load_sources_spec(settings.data_dir)  # listes blanches de champs par source (data/sources/)
    # messagerie : personas fictives, mentions, mots-clés de désinscription ; dossier absent (jeu de données réduit) => routes en 501
    messaging_data = load_messaging_data(settings.data_dir) if (settings.data_dir / "clients").is_dir() else None
    llm = get_adapter(settings.llm_provider, settings)
    planet_source = SimulatedPlanetSource(settings.data_dir)  # lieux du Tutoriel : corpus fictifs (data/planets/)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        run_migrations(settings)  # idempotent ; la base est créée/à jour avant la 1re requête
        engine = make_engine(settings)
        app.state.engine = engine
        app.state.session_factory = make_session_factory(engine)
        app.state.actions = ActionEngine(app.state.session_factory, app.state.rules, app.state.llm, profile_spec=app.state.profile_spec)
        reconcile(app.state.actions)  # RUNNING interrompus et réservations expirées (BE04)
        app.state.pub = PubEngine(app.state.actions, rules_v2, ads_spec, profile_spec)
        reconcile_ads(app.state.pub)  # générations de kit restées réservées après une interruption
        reconcile_prospect_actions(app.state.session_factory)  # générations de fiche client / premier message restées réservées
        app.state.searches = SearchEngine(app.state.actions, rules_v2, profile_spec, sources_spec, planet_source)  # recherches du bot scout
        reconcile_searches(app.state.searches)  # recherches interrompues
        app.state.assistant = AssistantEngine(  # assistants personnels
            app.state.actions, rules_v2, profile_spec, load_assistant_texts(settings.data_dir), searches=app.state.searches
        )
        reconcile_assistant(app.state.assistant)  # plans interrompus pendant leur exécution
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
    app.state.rules_v2 = rules_v2
    app.state.shop_catalog = shop_catalog
    app.state.profile_spec = profile_spec
    app.state.sources_spec = sources_spec
    app.state.ads_spec = ads_spec
    app.state.llm = llm
    app.state.messaging_data = messaging_data
    app.state.planet_source = planet_source
    app.state.prospects = SqlProspectLookup()  # la messagerie lit le carnet réel par ce `ProspectLookup`

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Content-Type", "Idempotency-Key"],
        )
    request_log_middleware(app)
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(auth.router)
    app.include_router(agents.router)
    app.include_router(shop.router)
    app.include_router(profile.router)
    app.include_router(prospects.router)
    app.include_router(campaigns.router)
    app.include_router(assistant.router)
    app.include_router(searches.router)
    app.include_router(conversations.router)
    app.include_router(actions.router)
    app.include_router(ops.router)
    return app


def _module_app() -> FastAPI:
    """`uvicorn app.main:app` : une configuration invalide arrête le processus avec un message lisible (code 2), sans trace."""
    try:
        return create_app()
    except ConfigError as exc:
        sys.stderr.write(f"{exc}\n")
        raise SystemExit(2) from None


app = _module_app()
