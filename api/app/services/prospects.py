"""Carnet de prospection (API-I1 à API-I3) : ajout depuis un rapport, liste, détail, modification, suppression.

Règles tenues ici :
- **Le navigateur ne fournit jamais de contenu** : `POST` reçoit des références (expédition, version de rapport, positions) ;
  le serveur recopie depuis l'enregistrement renvoyé par la source pendant l'expédition et le revérifie (`LEAD_UNVERIFIED`).
- Propriété de session : une ressource d'une autre session répond `NOT_FOUND`, comme une ressource inconnue.
- Provenance immuable ; le joueur ne modifie que `statut` et `notes` (concurrence optimiste par `version`).
- Toute mutation est rejouable par `Idempotency-Key` (empreintes et identifiants stockés, jamais de contenu).
- Consulter, trier, annoter, supprimer n'est jamais conditionné par l'argent ni par le score (aucun accès au ledger).
- Journaux : identifiants, compteurs et durées seulement."""

from __future__ import annotations

import base64
import json
import logging
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, case, delete, false, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from ..deps import hash_token
from ..errors import ApiError, ErrorCode
from ..models import ArtifactVersion, ExpeditionRecord, GameSession, MissionAttempt, Prospect, ProspectIdempotency, utcnow
from ..profile_spec import ProfileSpec
from ..rules_v2 import RulesV2
from ..schemas.prospects import (
    CanalOut,
    ProspectAddIn,
    ProspectAddOut,
    ProspectDetailOut,
    ProspectListOut,
    ProspectOut,
    ProspectPatchIn,
    RefusedLead,
    StatutEvent,
)
from ..sources_spec import SourcesSpec
from . import ledger, prospects_build as build
from . import profile as profile_svc
from .purchases import REUSED_KEY, request_hash

log = logging.getLogger("rubix.prospects")

FIABILITES = ("verifie", "partiel", "simule")
SORTS = ("pertinence", "date_ajout", "entreprise", "statut", "fiabilite", "source")
NOT_A_REPORT = "Cette version n'est pas un rapport de leads d'un agent pour cette expédition."


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _naive(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(tzinfo=None) if dt.tzinfo else dt


# ---------------------------------------------------------------- sortie


def to_out(row: Prospect, doublons: set[str]) -> ProspectOut:
    return ProspectOut(
        id=row.id, entreprise=row.entreprise, contact_nom=row.contact_nom, contact_fonction=row.contact_fonction,
        canal=CanalOut(type=row.canal_type, valeur=row.canal_valeur) if row.canal_type and row.canal_valeur else None,
        source=row.source, source_ref=row.source_ref, raisons_fit=list(row.raisons_fit or []), signal=row.signal,
        pertinence=row.pertinence, fiabilite=row.fiabilite, simule=row.simule, statut=row.statut, notes=row.notes,
        collecte_le=row.collecte_le, expedition_id=row.expedition_id, rapport_version_id=row.rapport_version_id,
        profile_version=row.profile_version, possible_doublon=row.entreprise_cle in doublons,
        cree_le=_aware(row.cree_le), modifie_le=_aware(row.modifie_le),
        contacte_le=_aware(row.contacte_le) if row.contacte_le else None,
        derniere_activite_le=_aware(row.derniere_activite_le), version=row.version,
    )


def _doublons(db: Session, session_id: str, keys: set[str]) -> set[str]:
    if not keys:
        return set()
    rows = db.execute(
        select(Prospect.entreprise_cle).where(Prospect.session_id == session_id, Prospect.entreprise_cle.in_(keys))
        .group_by(Prospect.entreprise_cle).having(func.count() > 1)
    )
    return {r[0] for r in rows}


def _outs(db: Session, session_id: str, rows: list[Prospect]) -> list[ProspectOut]:
    dup = _doublons(db, session_id, {r.entreprise_cle for r in rows})
    return [to_out(r, dup) for r in rows]


def _detail(db: Session, row: Prospect) -> ProspectDetailOut:
    base = _outs(db, row.session_id, [row])[0]
    hist = [StatutEvent(statut=h["statut"], le=_aware(datetime.fromisoformat(h["le"]))) for h in row.historique or []]
    return ProspectDetailOut(**base.model_dump(), instantane_source=dict(row.instantane or {}), historique_statut=hist)


# ---------------------------------------------------------------- idempotence


def _replay(db: Session, session_id: str, key_hash: str, req_hash: str) -> ProspectIdempotency | None:
    row = db.scalar(select(ProspectIdempotency).where(ProspectIdempotency.session_id == session_id, ProspectIdempotency.key_hash == key_hash))
    if row is not None and row.request_hash != req_hash:
        raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY)
    return row


def _remember(db: Session, session_id: str, key_hash: str, req_hash: str, status: int, result: dict | None) -> None:
    db.add(ProspectIdempotency(session_id=session_id, key_hash=key_hash, request_hash=req_hash, status_code=status, result=result))


def _begin(db: Session, session_id: str) -> GameSession:
    ledger.begin_immediate(db)
    game = db.get(GameSession, session_id)
    if game is None:
        raise ApiError(ErrorCode.SESSION_REQUIRED)
    return game


def _owned(db: Session, session_id: str, prospect_id: str) -> Prospect:
    row = db.get(Prospect, prospect_id)
    if row is None or row.session_id != session_id:
        raise ApiError(ErrorCode.NOT_FOUND)  # indiscernable d'un prospect inconnu
    return row


# ---------------------------------------------------------------- enregistrements d'expédition (écrits par le serveur)


def record_returned(db: Session, sources: SourcesSpec, attempt: MissionAttempt, source: str, source_ref: str, record: dict[str, Any]) -> ExpeditionRecord:
    """Enregistre un enregistrement **renvoyé par une source pendant l'expédition** (appelé par le moteur, côté serveur).
    Seuls les champs de la liste blanche sont conservés ; `source_ref` est celui de l'enregistrement. À ne jamais appeler
    avec un contenu venant du navigateur."""
    if not sources.known(source):
        raise ValueError("source hors liste blanche")
    snap = sources.minimize(source, {**record, "source_ref": source_ref})
    row = ExpeditionRecord(session_id=attempt.session_id, attempt_id=attempt.id, source=source, source_ref=source_ref, record=snap)
    db.add(row)
    db.flush()
    return row


# ---------------------------------------------------------------- ajout (API-I2)


def add_prospects(
    sf: sessionmaker[Session], rules: RulesV2, sources: SourcesSpec, profile_spec: ProfileSpec | None, session_id: str, key: str, payload: ProspectAddIn
) -> tuple[ProspectAddOut, int]:
    """Retourne (bilan, statut HTTP). 201 si au moins un prospect créé, 200 sinon (et au rejeu). Atomique."""
    key_hash = hash_token(key)
    positions = list(dict.fromkeys(payload.positions))
    req_hash = request_hash({"op": "add", "e": payload.expedition_id, "r": payload.rapport_version_id, "p": positions})
    with sf() as db:
        game = _begin(db, session_id)
        replay = _replay(db, session_id, key_hash, req_hash)
        if replay is not None:
            res = replay.result or {}
            ids = res.get("added", [])
            rows = {r.id: r for r in db.scalars(select(Prospect).where(Prospect.session_id == session_id, Prospect.id.in_(ids)))} if ids else {}
            added = _outs(db, session_id, [rows[i] for i in ids if i in rows])
            return ProspectAddOut(added=added, already_present=res.get("already_present", []), refused=res.get("refused", [])), 200

        attempt = db.get(MissionAttempt, payload.expedition_id)
        if attempt is None or attempt.session_id != session_id:
            raise ApiError(ErrorCode.NOT_FOUND)
        report = db.get(ArtifactVersion, payload.rapport_version_id)
        if report is None or report.attempt_id != attempt.id:
            raise ApiError(ErrorCode.NOT_FOUND)
        if report.author != "agent":  # une version écrite par le joueur est du contenu du navigateur : jamais une source de prospect
            raise ApiError(ErrorCode.INVALID_REQUEST, NOT_A_REPORT)
        leads = build.parse_leads(report.content)
        if leads is None:
            raise ApiError(ErrorCode.INVALID_REQUEST, NOT_A_REPORT)

        profile_version = attempt.profile_version or 1
        profile = profile_svc.version_row(db, session_id, profile_version)
        sectors = profile_spec.sectors if profile_spec is not None else []
        created: list[Prospect] = []
        already: list[str] = []
        refused: list[RefusedLead] = []
        for pos in positions:
            lead = leads[pos] if 0 <= pos < len(leads) else None
            fields = None
            record = None
            if lead is not None:
                ref = lead.get("source_ref")
                src = lead.get("source")
                if isinstance(ref, str) and ref.strip() and len(ref) <= 120 and (src is None or isinstance(src, str)):
                    q = select(ExpeditionRecord).where(
                        ExpeditionRecord.attempt_id == attempt.id, ExpeditionRecord.session_id == session_id, ExpeditionRecord.source_ref == ref
                    )
                    if src is not None:
                        q = q.where(ExpeditionRecord.source == src)
                    found = list(db.scalars(q.limit(2)))
                    if len(found) == 1 and sources.known(found[0].source):
                        record = found[0]
            if record is not None:
                existing = db.scalar(
                    select(Prospect).where(Prospect.session_id == session_id, Prospect.source == record.source, Prospect.source_ref == record.source_ref)
                )
                if existing is not None:
                    already.append(existing.id)
                    continue
                fields = build.build_prospect_fields(
                    sources=sources, source=record.source, record=record.record, lead=lead, profile=profile, spec_sectors=sectors,
                    simulated=game.mode != "expert",
                )
            if fields is None or record is None:
                refused.append(RefusedLead(position=pos, code="LEAD_UNVERIFIED"))
                continue
            now = utcnow()
            row = Prospect(
                session_id=session_id, source=record.source, source_ref=record.source_ref, expedition_id=attempt.id,
                rapport_version_id=report.id, profile_version=profile_version, statut="nouveau", notes="",
                historique=[{"statut": "nouveau", "le": now.isoformat()}], cree_le=now, modifie_le=now, derniere_activite_le=now,
                version=1, **fields,
            )
            db.add(row)
            db.flush()
            created.append(row)

        total = db.scalar(select(func.count()).select_from(Prospect).where(Prospect.session_id == session_id)) or 0
        if total > rules.limits.prospects_max:  # tout ou rien : rien n'est écrit au-delà de la limite
            db.rollback()
            raise ApiError(ErrorCode.INVALID_STATE, f"Le carnet est plein ({rules.limits.prospects_max} prospects au maximum).")
        status = 201 if created else 200
        added_out = _outs(db, session_id, created)
        _remember(
            db, session_id, key_hash, req_hash, status,
            {"added": [r.id for r in created], "already_present": already, "refused": [r.model_dump() for r in refused]},
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise ApiError(ErrorCode.INVALID_STATE, "Le carnet a changé pendant l'ajout ; réessayez.") from None
    log.info("prospects_add", extra={"event": "prospects_add", "count": len(created)})
    return ProspectAddOut(added=added_out, already_present=already, refused=refused), status


# ---------------------------------------------------------------- lecture (API-I3)


@dataclass(frozen=True)
class Filters:
    statut: str | None = None
    source: str | None = None
    fiabilite: str | None = None
    avec_fiche: bool | None = None
    avec_brouillon: bool | None = None
    a_relancer: bool | None = None
    q: str | None = None


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _where(rules: RulesV2, session_id: str, f: Filters, now: datetime) -> list:
    if f.statut is not None and f.statut not in rules.prospect_statuses:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Statut inconnu.")
    if f.fiabilite is not None and f.fiabilite not in FIABILITES:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Fiabilité inconnue.")
    w: list = [Prospect.session_id == session_id]
    if f.statut is not None:
        w.append(Prospect.statut == f.statut)
    if f.source is not None:
        w.append(Prospect.source == f.source)
    if f.fiabilite is not None:
        w.append(Prospect.fiabilite == f.fiabilite)
    # Fiches clients et brouillons : tables livrées aux jalons J et K. Tant qu'elles n'existent pas, aucun prospect n'en a.
    if f.avec_fiche:
        w.append(false())
    if f.avec_brouillon:
        w.append(false())
    if f.a_relancer:
        limit = _naive(now - timedelta(days=rules.followup_days))
        w.append(and_(Prospect.statut == "contacte", Prospect.contacte_le.is_not(None), Prospect.contacte_le <= limit))
    if f.q and f.q.strip():
        raw = f"%{_escape_like(f.q.strip().casefold())}%"
        cle = f"%{_escape_like(build.norm(f.q))}%"
        w.append(
            or_(
                Prospect.entreprise_cle.like(cle, escape="\\"),
                *(func.lower(col).like(raw, escape="\\") for col in (Prospect.contact_nom, Prospect.contact_fonction, Prospect.notes)),
            )
        )
    return w


def _sort_expr(rules: RulesV2, tri: str):
    if tri == "pertinence":
        return Prospect.pertinence
    if tri == "date_ajout":
        return Prospect.cree_le
    if tri == "entreprise":
        return Prospect.entreprise_cle
    if tri == "statut":
        return case(*[(Prospect.statut == s, i) for i, s in enumerate(rules.prospect_statuses)], else_=len(rules.prospect_statuses))
    if tri == "fiabilite":
        return case(*[(Prospect.fiabilite == s, i) for i, s in enumerate(FIABILITES)], else_=len(FIABILITES))
    if tri == "source":
        return Prospect.source
    raise ApiError(ErrorCode.INVALID_REQUEST, "Tri inconnu.")


def default_order(tri: str) -> str:
    return "desc" if tri in ("pertinence", "date_ajout") else "asc"


def _sort_value(row: Prospect, tri: str, rules: RulesV2) -> Any:
    if tri == "pertinence":
        return row.pertinence
    if tri == "date_ajout":
        return _naive(row.cree_le).isoformat()
    if tri == "entreprise":
        return row.entreprise_cle
    if tri == "statut":
        return rules.prospect_statuses.index(row.statut) if row.statut in rules.prospect_statuses else len(rules.prospect_statuses)
    if tri == "fiabilite":
        return FIABILITES.index(row.fiabilite) if row.fiabilite in FIABILITES else len(FIABILITES)
    return row.source


def _encode_cursor(tri: str, ordre: str, value: Any, id_: str) -> str:
    return base64.urlsafe_b64encode(json.dumps([tri, ordre, value, id_], ensure_ascii=False).encode()).decode()


def _decode_cursor(cursor: str, tri: str, ordre: str) -> tuple[Any, str]:
    try:
        t, o, value, id_ = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        if t != tri or o != ordre or not isinstance(id_, str):
            raise ValueError
    except (ValueError, TypeError):
        raise ApiError(ErrorCode.INVALID_REQUEST, "Curseur invalide.") from None
    if tri == "date_ajout":
        try:
            value = datetime.fromisoformat(value)
        except (ValueError, TypeError):
            raise ApiError(ErrorCode.INVALID_REQUEST, "Curseur invalide.") from None
    return value, id_


def _ordered(rules: RulesV2, session_id: str, f: Filters, tri: str, ordre: str, now: datetime):
    expr = _sort_expr(rules, tri)
    asc = ordre == "asc"
    q = select(Prospect).where(*_where(rules, session_id, f, now)).order_by(expr.asc() if asc else expr.desc(), Prospect.id.asc() if asc else Prospect.id.desc())
    return q, expr, asc


def counts(db: Session, rules: RulesV2, session_id: str) -> dict[str, int]:
    out = {s: 0 for s in rules.prospect_statuses}
    for statut, n in db.execute(select(Prospect.statut, func.count()).where(Prospect.session_id == session_id).group_by(Prospect.statut)):
        out[statut] = n
    return out


def list_prospects(
    sf: sessionmaker[Session], rules: RulesV2, session_id: str, f: Filters, tri: str, ordre: str | None, limit: int, cursor: str | None,
    now: datetime | None = None,
) -> ProspectListOut:
    ordre = ordre or default_order(tri)
    now = now or utcnow()
    with sf() as db:
        q, expr, asc = _ordered(rules, session_id, f, tri, ordre, now)
        if cursor:
            value, last_id = _decode_cursor(cursor, tri, ordre)
            if tri == "date_ajout":
                value = _naive(value)
            cmp = (expr > value, Prospect.id > last_id) if asc else (expr < value, Prospect.id < last_id)
            q = q.where(or_(cmp[0], and_(expr == value, cmp[1])))
        rows = list(db.scalars(q.limit(limit + 1)))
        nxt = None
        if len(rows) > limit:
            rows = rows[:limit]
            nxt = _encode_cursor(tri, ordre, _sort_value(rows[-1], tri, rules), rows[-1].id)
        c = counts(db, rules, session_id)
        items = _outs(db, session_id, rows)
    return ProspectListOut(items=items, next_cursor=nxt, counts=c, total=sum(c.values()))


def all_rows(sf: sessionmaker[Session], rules: RulesV2, session_id: str, f: Filters, tri: str, ordre: str | None, now: datetime | None = None) -> tuple[list[Prospect], str]:
    """Toutes les lignes (mêmes filtres et tri que la liste) pour l'export ; retourne aussi le mode de la partie."""
    ordre = ordre or default_order(tri)
    with sf() as db:
        q, _, _ = _ordered(rules, session_id, f, tri, ordre, now or utcnow())
        rows = list(db.scalars(q))
        mode = db.scalar(select(GameSession.mode).where(GameSession.id == session_id)) or "beginner"
    return rows, mode


def get_prospect(sf: sessionmaker[Session], session_id: str, prospect_id: str) -> ProspectDetailOut:
    with sf() as db:
        return _detail(db, _owned(db, session_id, prospect_id))


# ---------------------------------------------------------------- modification et suppression (API-I3)


def _clean_notes(value: str, limit: int) -> str:
    out = "".join(" " if (unicodedata.category(c) == "Cc" and c not in "\n\t") else c for c in value).strip()
    if len(out) > limit:
        raise ApiError(ErrorCode.INVALID_REQUEST, f"Notes trop longues (maximum {limit} caractères).")
    return out


def patch_prospect(
    sf: sessionmaker[Session], rules: RulesV2, session_id: str, prospect_id: str, key: str, payload: ProspectPatchIn
) -> ProspectDetailOut:
    """Seuls `statut` et `notes` changent. Transitions libres, horodatées ; `contacte_le` au premier passage à `contacte`.
    Sans changement réel : rien n'est écrit et la `version` ne bouge pas."""
    key_hash = hash_token(key)
    req_hash = request_hash({"op": "patch", "id": prospect_id, "v": payload.version, "s": payload.statut, "n": payload.notes})
    if payload.statut is None and payload.notes is None:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Rien à modifier : fournissez `statut` et/ou `notes`.")
    if payload.statut is not None and payload.statut not in rules.prospect_statuses:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Statut inconnu.")
    notes = _clean_notes(payload.notes, rules.limits.notes_max_chars) if payload.notes is not None else None
    with sf() as db:
        _begin(db, session_id)
        replay = _replay(db, session_id, key_hash, req_hash)
        row = _owned(db, session_id, prospect_id)  # rejeu : la ressource doit toujours exister et appartenir à la session
        if replay is not None:
            return _detail(db, row)
        if payload.version != row.version:
            raise ApiError(ErrorCode.VERSION_CONFLICT, "Ce prospect a changé depuis votre dernière lecture ; rechargez-le.")
        now = utcnow()
        changed = False
        if payload.statut is not None and payload.statut != row.statut:
            row.statut = payload.statut
            row.historique = [*(row.historique or []), {"statut": payload.statut, "le": now.isoformat()}]
            if payload.statut == "contacte" and row.contacte_le is None:
                row.contacte_le = now
            changed = True
        if notes is not None and notes != row.notes:
            row.notes = notes
            changed = True
        if changed:
            row.version += 1
            row.modifie_le = now
            row.derniere_activite_le = now
        _remember(db, session_id, key_hash, req_hash, 200, {"id": row.id})
        db.commit()
        return _detail(db, row)


def delete_prospect(sf: sessionmaker[Session], session_id: str, prospect_id: str, key: str) -> None:
    """Suppression définitive (le prospect, son instantané, et — aux jalons suivants — fiches et brouillons en cascade).
    Rejeu avec la même clé : même résultat (204). Prospect absent avec une clé neuve : NOT_FOUND."""
    key_hash = hash_token(key)
    req_hash = request_hash({"op": "delete", "id": prospect_id})
    with sf() as db:
        _begin(db, session_id)
        if _replay(db, session_id, key_hash, req_hash) is not None:
            return
        row = _owned(db, session_id, prospect_id)
        db.delete(row)
        _remember(db, session_id, key_hash, req_hash, 204, None)
        db.commit()
    log.info("prospects_delete", extra={"event": "prospects_delete", "count": 1})


def purge_prospects(sf: sessionmaker[Session], session_id: str, key: str) -> int:
    """Supprime tout le carnet de la partie (idempotent, 204 même s'il est déjà vide)."""
    key_hash = hash_token(key)
    req_hash = request_hash({"op": "purge"})
    with sf() as db:
        _begin(db, session_id)
        if _replay(db, session_id, key_hash, req_hash) is not None:
            return 0
        n = db.execute(delete(Prospect).where(Prospect.session_id == session_id)).rowcount or 0
        _remember(db, session_id, key_hash, req_hash, 204, None)
        db.commit()
    log.info("prospects_purge", extra={"event": "prospects_purge", "count": n})
    return n
