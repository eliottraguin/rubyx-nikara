"""Comptes de test pour la QA (dev / démo uniquement) : 3 comptes aux identifiants connus, dont deux avec une entreprise déjà créée.

Les comptes passent par les mêmes briques que l'inscription (`normalize_email`, argon2id, `create_session`) : aucune règle dupliquée.
Idempotent : relancer réinitialise le mot de passe des comptes QA et recrée leur partie. Seuls les comptes du domaine QA
(`@qa.rubix.test`, domaine réservé, non routable) et les parties marquées `company.qa` sont touchés."""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import GameSession, User
from ..rules import Rules
from ..schemas.common import Mode
from ..schemas.state import SessionCreate
from ..services import auth as auth_svc
from ..services import sessions as sessions_svc

QA_DOMAIN = "qa.rubix.test"
PASSWORD_ENV = "RUBIX_QA_PASSWORD"
ACCOUNTS_FORMAT = "rubix-qa-accounts/1"


class QaSeedError(Exception):
    """Erreur lisible (message en français, aucun secret)."""


@dataclass(frozen=True)
class QaAccount:
    label: str
    local: str
    mode: Mode | None  # None : compte sans entreprise (parcours « première partie »)
    company: str | None

    @property
    def email(self) -> str:
        return f"{self.local}@{QA_DOMAIN}"


QA_ACCOUNTS = (
    QaAccount("sans entreprise", "qa-vierge", None, None),
    QaAccount("entreprise débutant", "qa-debutant", Mode.BEGINNER, "Atelier QA Débutant"),
    QaAccount("entreprise expert", "qa-expert", Mode.EXPERT, "Atelier QA Expert"),
)


def resolve_password(env: dict[str, str] | None = None) -> str | None:
    """Mot de passe commun imposé par l'environnement (validé par la politique des comptes), ou None : un mot de passe aléatoire par compte."""
    raw = (env if env is not None else os.environ).get(PASSWORD_ENV)
    if not raw:
        return None
    try:
        auth_svc.check_password_policy(raw)
    except Exception as exc:  # noqa: BLE001
        raise QaSeedError(f"{PASSWORD_ENV} ne respecte pas la politique de mots de passe ({auth_svc.MIN_PASSWORD} à {auth_svc.MAX_PASSWORD} caractères).") from exc
    return raw


def _is_qa_game(game: GameSession) -> bool:
    return (game.company or {}).get("qa") is True


def seed_accounts(db: Session, rules: Rules, password: str | None = None) -> list[dict[str, str | None]]:
    """Crée ou réinitialise les comptes QA. Retourne les identifiants en clair (à écrire dans un fichier hors dépôt, jamais journalisés)."""
    out: list[dict[str, str | None]] = []
    for acc in QA_ACCOUNTS:
        pw = password or secrets.token_urlsafe(12)
        auth_svc.check_password_policy(pw)
        user = db.scalar(select(User).where(User.email == acc.email))
        if user is None:
            user = User(email=acc.email, password_hash=auth_svc._hasher.hash(pw))
            db.add(user)
            db.flush()
        else:
            user.password_hash = auth_svc._hasher.hash(pw)
            user.token_hash = None  # déconnecte une session ouverte avec l'ancien mot de passe
        stale = [g.id for g in db.scalars(select(GameSession).where(GameSession.user_id == user.id)) if _is_qa_game(g)]
        if stale:
            db.execute(delete(GameSession).where(GameSession.id.in_(stale)))
        if acc.mode is not None:
            game, _token = sessions_svc.create_session(db, rules, SessionCreate(company_name=acc.company, mode=acc.mode))
            game.user_id = user.id
            game.company = {**game.company, "qa": True}
        db.commit()
        out.append({"label": acc.label, "email": acc.email, "password": pw, "company": acc.company, "mode": acc.mode.value if acc.mode else None})
    return out


def write_accounts(path: Path, accounts: list[dict[str, str | None]]) -> None:
    """Fichier lisible par son seul propriétaire (0600), à garder hors dépôt (`api/var/` est ignoré par git)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"format": ACCOUNTS_FORMAT, "accounts": accounts}, f, ensure_ascii=False, indent=2)
        f.write("\n")
