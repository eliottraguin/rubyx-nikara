"""Configuration serveur, lue dans l'environnement (jamais de secret en dur, jamais de secret par défaut).

`Settings.from_env()` valide tout au démarrage et lève `ConfigError` (liste lisible de tous les problèmes,
sans jamais citer la valeur d'un secret). Variables documentées dans `api/.env.example` et `api/OPERATIONS.md`."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

API_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = API_DIR.parent

LLM_PROVIDERS = ("mock", "real")
LOG_FORMATS = ("json", "text")
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR")
MIN_SECRET_LENGTH = 16
_TRUE = {"1", "true", "yes"}
_FALSE = {"0", "false", "no", ""}
_COOKIE_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class ConfigError(Exception):
    """Configuration incohérente : `problems` liste chaque variable fautive (aucune valeur secrète)."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("Configuration invalide :\n" + "\n".join(f"  - {p}" for p in problems))


def _split(value: str) -> tuple[str, ...]:
    return tuple(v.strip() for v in value.split(",") if v.strip())


@dataclass(frozen=True)
class Settings:
    db_path: Path = API_DIR / "var" / "rubix.db"
    data_dir: Path = REPO_DIR / "data"
    rules_version: str = "rules_v1"
    llm_provider: str = "mock"
    cookie_name: str = "rubix_session"
    cookie_secure: bool = False  # mettre RUBIX_COOKIE_SECURE=1 derrière HTTPS
    cors_origins: tuple[str, ...] = field(default_factory=tuple)
    # Secret du mode démo (BE02) : absent => `POST /api/demo/events` inexistant (404). Jamais affiché (repr=False).
    demo_secret: str | None = field(default=None, repr=False)
    # Clé du fournisseur réel (exigée si RUBIX_LLM_PROVIDER=real). Jamais affichée ni journalisée.
    llm_api_key: str | None = field(default=None, repr=False)
    retention_days: int = 7  # durée de rétention des parties (commande `purge`)
    token_cap_session: int | None = None  # plafond de tokens (entrée+sortie) par partie ; None = non plafonné
    token_cap_global: int | None = None  # plafond global de tokens ; None = non plafonné
    log_level: str = "INFO"
    log_format: str = "json"
    # BE06 : évalue automatiquement chaque livraison (après la réponse de `submit`). 0 = livraisons laissées en EVALUATING.
    auto_evaluate: bool = True

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        d = cls()
        problems: list[str] = []

        def integer(name: str, default: int | None) -> int | None:
            raw = env.get(name, "").strip()
            if not raw:
                return default
            try:
                return int(raw)
            except ValueError:
                problems.append(f"{name} doit être un entier.")
                return default

        def boolean(name: str, default: bool) -> bool:
            raw = env.get(name)
            if raw is None:
                return default
            low = raw.strip().lower()
            if low in _TRUE:
                return True
            if low in _FALSE:
                return False
            problems.append(f"{name} doit valoir 1/0, true/false ou yes/no.")
            return default

        s = cls(
            db_path=Path(env.get("RUBIX_DB_PATH") or d.db_path),
            data_dir=Path(env.get("RUBIX_DATA_DIR") or d.data_dir),
            rules_version=env.get("RUBIX_RULES_VERSION") or d.rules_version,
            llm_provider=(env.get("RUBIX_LLM_PROVIDER") or d.llm_provider).strip().lower(),
            cookie_name=env.get("RUBIX_COOKIE_NAME") or d.cookie_name,
            cookie_secure=boolean("RUBIX_COOKIE_SECURE", d.cookie_secure),
            cors_origins=_split(env.get("RUBIX_CORS_ORIGINS", "")),
            demo_secret=env.get("RUBIX_DEMO_SECRET") or None,
            llm_api_key=env.get("RUBIX_LLM_API_KEY") or None,
            retention_days=integer("RUBIX_RETENTION_DAYS", d.retention_days) or 0,
            token_cap_session=integer("RUBIX_TOKEN_CAP_SESSION", None),
            token_cap_global=integer("RUBIX_TOKEN_CAP_GLOBAL", None),
            log_level=(env.get("RUBIX_LOG_LEVEL") or d.log_level).strip().upper(),
            log_format=(env.get("RUBIX_LOG_FORMAT") or d.log_format).strip().lower(),
            auto_evaluate=boolean("RUBIX_AUTO_EVALUATE", d.auto_evaluate),
        )
        problems += s.problems()
        if problems:
            raise ConfigError(problems)
        return s

    def validate(self) -> None:
        problems = self.problems()
        if problems:
            raise ConfigError(problems)

    def problems(self) -> list[str]:
        """Incohérences de configuration (messages en français, jamais de valeur secrète)."""
        p: list[str] = []
        if self.llm_provider not in LLM_PROVIDERS:
            p.append(f"RUBIX_LLM_PROVIDER doit valoir l'une de : {', '.join(LLM_PROVIDERS)}.")
        if self.llm_provider == "real" and not self.llm_api_key:
            p.append("RUBIX_LLM_PROVIDER=real exige RUBIX_LLM_API_KEY (aucune clé par défaut).")
        if self.demo_secret is not None and len(self.demo_secret) < MIN_SECRET_LENGTH:
            p.append(f"RUBIX_DEMO_SECRET est trop court (minimum {MIN_SECRET_LENGTH} caractères) ; laisser vide pour désactiver la démo.")
        if self.retention_days < 1:
            p.append("RUBIX_RETENTION_DAYS doit être un entier supérieur ou égal à 1.")
        for name, cap in (("RUBIX_TOKEN_CAP_SESSION", self.token_cap_session), ("RUBIX_TOKEN_CAP_GLOBAL", self.token_cap_global)):
            if cap is not None and cap < 1:
                p.append(f"{name} doit être un entier supérieur ou égal à 1 (ou absent = non plafonné).")
        if (
            self.token_cap_session is not None
            and self.token_cap_global is not None
            and self.token_cap_session > self.token_cap_global
        ):
            p.append("RUBIX_TOKEN_CAP_SESSION ne peut pas dépasser RUBIX_TOKEN_CAP_GLOBAL.")
        if not _COOKIE_RE.match(self.cookie_name):
            p.append("RUBIX_COOKIE_NAME invalide (lettres, chiffres, _ et - ; 64 caractères maximum).")
        for origin in self.cors_origins:
            u = urlparse(origin)
            if origin == "*":
                p.append("RUBIX_CORS_ORIGINS ne peut pas contenir « * » (cookies de session : origines explicites uniquement).")
            elif u.scheme not in {"http", "https"} or not u.netloc or u.path not in {"", "/"} or u.query or u.fragment:
                p.append(f"RUBIX_CORS_ORIGINS : origine invalide « {origin} » (attendu : http(s)://hôte[:port], sans chemin).")
        if self.log_level not in LOG_LEVELS:
            p.append(f"RUBIX_LOG_LEVEL doit valoir l'une de : {', '.join(LOG_LEVELS)}.")
        if self.log_format not in LOG_FORMATS:
            p.append(f"RUBIX_LOG_FORMAT doit valoir l'une de : {', '.join(LOG_FORMATS)}.")
        if "/" in self.rules_version or "\\" in self.rules_version or ".." in self.rules_version or not self.rules_version:
            p.append("RUBIX_RULES_VERSION invalide.")
        elif not (self.data_dir / "rules" / f"{self.rules_version}.json").is_file():
            p.append(f"Règles introuvables : {self.data_dir / 'rules' / (self.rules_version + '.json')} (RUBIX_DATA_DIR / RUBIX_RULES_VERSION).")
        if self.db_path.is_dir():
            p.append(f"RUBIX_DB_PATH désigne un dossier : {self.db_path}.")
        else:
            parent = self.db_path.parent
            probe = parent
            while not probe.exists() and probe != probe.parent:
                probe = probe.parent  # le dossier sera créé au démarrage : on contrôle le premier parent existant
            if not probe.is_dir() or not os.access(probe, os.W_OK | os.X_OK):
                p.append(f"RUBIX_DB_PATH : le dossier {parent} n'est pas accessible en écriture.")
        return p

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path}"

    def public_summary(self) -> dict[str, object]:
        """Résumé sans aucun secret (clé, secret de démo) : commande `config`, journal de démarrage."""
        return {
            "db_path": str(self.db_path),
            "data_dir": str(self.data_dir),
            "rules_version": self.rules_version,
            "llm_provider": self.llm_provider,
            "cookie_secure": self.cookie_secure,
            "cors_origins": list(self.cors_origins),
            "demo_enabled": bool(self.demo_secret),
            "llm_api_key_set": bool(self.llm_api_key),
            "retention_days": self.retention_days,
            "token_cap_session": self.token_cap_session,
            "token_cap_global": self.token_cap_global,
            "log_level": self.log_level,
            "log_format": self.log_format,
        }
