"""Crée un compte de test local : `JWT_SECRET_KEY=... python -m app.create_test_user <email>`.

Le mot de passe est lu dans TEST_USER_PASSWORD, sinon généré aléatoirement et affiché une seule fois.
Rien n'est écrit sur disque ni committé. Ne pas utiliser en production.
"""

from __future__ import annotations

import os
import secrets
import sys

from sqlalchemy import select

from .auth import hash_password, normalize_email
from .config import Settings
from .db import make_engine, make_session_factory, run_migrations
from .models import AuthUser


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python -m app.create_test_user <email>", file=sys.stderr)
        return 2
    email = normalize_email(argv[1])
    password = os.environ.get("TEST_USER_PASSWORD") or secrets.token_urlsafe(16)
    if len(password) < 8:
        print("TEST_USER_PASSWORD : 8 caractères minimum", file=sys.stderr)
        return 2
    settings = Settings.from_env()
    run_migrations(settings)
    with make_session_factory(make_engine(settings))() as db:
        if db.scalar(select(AuthUser).where(AuthUser.email == email)):
            print(f"{email} existe déjà", file=sys.stderr)
            return 1
        db.add(AuthUser(email=email, password_hash=hash_password(password)))
        db.commit()
    print(f"Compte créé : {email}")
    if not os.environ.get("TEST_USER_PASSWORD"):
        print(f"Mot de passe (affiché une seule fois) : {password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
