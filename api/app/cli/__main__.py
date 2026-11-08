"""`uv run python -m app.cli <commande>` : exploitation (config, check, demo-*, qa-seed, backup, restore, purge, usage).

Sortie JSON sur stdout ; erreurs lisibles sur stderr (code 1 : opération refusée, 2 : configuration invalide)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ..config import ConfigError, Settings
from ..db import make_engine, make_session_factory, run_migrations
from ..llm import get_adapter
from ..rules import load_rules
from . import demo as demo_ops
from . import qa_seed
from . import storage
from .health import check_state


def _out(data: object) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def _need_db(settings: Settings) -> None:
    if not settings.db_path.is_file():
        raise storage.OpsError("Base introuvable (RUBIX_DB_PATH) : démarrer l'API une fois ou lancer demo-init.")


def _session(settings: Settings, migrate: bool = False):
    if migrate:
        run_migrations(settings)
    else:
        _need_db(settings)
    engine = make_engine(settings)
    return engine, make_session_factory(engine)


def cmd_config(settings: Settings, args) -> int:  # noqa: ANN001
    _out({"ok": True, "config": settings.public_summary()})
    return 0


def cmd_check(settings: Settings, args) -> int:  # noqa: ANN001
    rules = llm = None
    try:
        rules = load_rules(settings.data_dir, settings.rules_version)
    except Exception:  # noqa: BLE001
        pass
    try:
        llm = get_adapter(settings.llm_provider, settings)
    except Exception:  # noqa: BLE001
        pass
    if not settings.db_path.is_file():
        report = {"ok": False, "checks": {"db": {"ok": False, "detail": "fichier de base absent"}}}
        _out(report)
        return 1
    engine = make_engine(settings)
    try:
        report = check_state(engine, settings, rules, llm)
    finally:
        engine.dispose()
    _out(report)
    return 0 if report["ok"] else 1


def cmd_demo_init(settings: Settings, args) -> int:  # noqa: ANN001
    if settings.llm_provider != "mock" and not args.allow_real:
        raise storage.OpsError("La démo seedée exige le fournisseur simulé (RUBIX_LLM_PROVIDER=mock), ou --allow-real.")
    rules = load_rules(settings.data_dir, settings.rules_version)
    engine, sf = _session(settings, migrate=True)
    try:
        with sf() as db:
            if args.reset:
                game, token, removed = demo_ops.reset_demo(db, rules, args.mode)
            else:
                game, token = demo_ops.init_demo(db, rules, args.mode, replace=args.replace)
                removed = None
            res = {"ok": True, "session_id": game.id, "mode": game.mode, "seed": game.seed, "demo": True, "simulated": settings.llm_provider == "mock"}
            if removed is not None:
                res["removed_demo_sessions"] = removed
            if args.print_token:
                res["cookie"] = f"{settings.cookie_name}={token}"
            else:
                res["cookie"] = "non affiché (option --print-token)"
            _out(res)
    finally:
        engine.dispose()
    return 0


def cmd_qa_seed(settings: Settings, args) -> int:  # noqa: ANN001
    if settings.cookie_secure and not args.allow_prod:
        raise storage.OpsError("Comptes de test refusés : RUBIX_COOKIE_SECURE=1 indique un déploiement HTTPS ; réservé au dev/démo (--allow-prod pour forcer).")
    try:
        password = qa_seed.resolve_password()
    except qa_seed.QaSeedError as exc:
        raise storage.OpsError(str(exc)) from exc
    out_path = Path(args.file) if args.file else settings.db_path.parent / "qa-accounts.json"
    rules = load_rules(settings.data_dir, settings.rules_version)
    engine, sf = _session(settings, migrate=True)
    try:
        with sf() as db:
            accounts = qa_seed.seed_accounts(db, rules, password)
        qa_seed.write_accounts(out_path, accounts)
        _out({"ok": True, "file": str(out_path), "accounts": [{k: a[k] for k in ("label", "email", "company", "mode")} for a in accounts]})
    finally:
        engine.dispose()
    return 0


def cmd_demo_export(settings: Settings, args) -> int:  # noqa: ANN001
    engine, sf = _session(settings)
    try:
        with sf() as db:
            snap = demo_ops.export_snapshot(db, args.session)
        demo_ops.write_snapshot(Path(args.file), snap)
        _out({"ok": True, "file": args.file, "session_id": snap["session_id"], "rows": {t: len(r) for t, r in snap["tables"].items() if r}})
    finally:
        engine.dispose()
    return 0


def cmd_demo_import(settings: Settings, args) -> int:  # noqa: ANN001
    path = Path(args.file)
    if not path.is_file():
        raise storage.OpsError("Fichier de snapshot introuvable.")
    try:
        snap = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise storage.OpsError("Snapshot illisible (JSON invalide).") from exc
    engine, sf = _session(settings, migrate=True)
    try:
        with sf() as db:
            sid = demo_ops.import_snapshot(db, snap)
        _out({"ok": True, "session_id": sid})
    finally:
        engine.dispose()
    return 0


def cmd_backup(settings: Settings, args) -> int:  # noqa: ANN001
    _out({"ok": True, **storage.backup_db(settings, Path(args.file), args.force)})
    return 0


def cmd_restore(settings: Settings, args) -> int:  # noqa: ANN001
    _out({"ok": True, **storage.restore_db(settings, Path(args.file), args.force)})
    return 0


def cmd_purge(settings: Settings, args) -> int:  # noqa: ANN001
    engine, sf = _session(settings)
    try:
        with sf() as db:
            res = storage.purge_sessions(db, args.days if args.days is not None else settings.retention_days, dry_run=args.dry_run, include_demo=args.include_demo)
        if args.vacuum and not args.dry_run:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.exec_driver_sql("VACUUM")
        _out({"ok": True, **res})
    finally:
        engine.dispose()
    return 0


def cmd_usage(settings: Settings, args) -> int:  # noqa: ANN001
    engine, sf = _session(settings)
    try:
        with sf() as db:
            _out({"ok": True, **storage.usage_report(db, settings)})
    finally:
        engine.dispose()
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m app.cli", description="Exploitation de l'API (BE08).")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("config", help="valide la configuration et l'affiche sans secret").set_defaults(fn=cmd_config)
    sub.add_parser("check", help="santé, schéma de base, règles, fournisseur (sans réseau)").set_defaults(fn=cmd_check)

    d = sub.add_parser("demo-init", help="crée la partie de démo seedée (graine fixe, mode simulé)")
    d.add_argument("--mode", choices=["beginner", "expert"], default="beginner")
    d.add_argument("--replace", action="store_true", help="remplace une démo existante")
    d.add_argument("--reset", action="store_true", help="réinitialise la démo (F14 hors ligne)")
    d.add_argument("--print-token", action="store_true", help="affiche le cookie de la partie de démo")
    d.add_argument("--allow-real", action="store_true", help="autorise la démo avec le fournisseur réel")
    d.set_defaults(fn=cmd_demo_init)

    q = sub.add_parser("qa-seed", help="crée/réinitialise 3 comptes de test QA (dev/démo) ; identifiants écrits dans un fichier 0600 hors dépôt")
    q.add_argument("--file", help="fichier des identifiants ; défaut : qa-accounts.json à côté de la base (api/var/, ignoré par git)")
    q.add_argument("--allow-prod", action="store_true", help="autorise malgré RUBIX_COOKIE_SECURE=1")
    q.set_defaults(fn=cmd_qa_seed)

    e = sub.add_parser("demo-export", help="exporte un snapshot JSON de la partie de démo")
    e.add_argument("file")
    e.add_argument("--session", help="identifiant (si plusieurs démos)")
    e.set_defaults(fn=cmd_demo_export)
    i = sub.add_parser("demo-import", help="restaure un snapshot de démo (remplace la démo)")
    i.add_argument("file")
    i.set_defaults(fn=cmd_demo_import)

    b = sub.add_parser("backup", help="sauvegarde cohérente à chaud de la base (API de sauvegarde sqlite3)")
    b.add_argument("file")
    b.add_argument("--force", action="store_true")
    b.set_defaults(fn=cmd_backup)
    r = sub.add_parser("restore", help="restaure la base (service ARRÊTÉ) ; copie de sécurité automatique")
    r.add_argument("file")
    r.add_argument("--force", action="store_true")
    r.set_defaults(fn=cmd_restore)

    g = sub.add_parser("purge", help="supprime les parties plus anciennes que la rétention (cascade)")
    g.add_argument("--days", type=int, help="remplace RUBIX_RETENTION_DAYS")
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--include-demo", action="store_true")
    g.add_argument("--vacuum", action="store_true", help="compacte la base ensuite")
    g.set_defaults(fn=cmd_purge)

    sub.add_parser("usage", help="suivi technique des appels IA (tokens, échecs, estimations)").set_defaults(fn=cmd_usage)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    try:
        return args.fn(settings, args)
    except (storage.OpsError, demo_ops.DemoError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
