"""Carnet de prospection : liste, détail, modification, suppression, export.

Règles tenues ici :
- **Le navigateur ne fournit jamais de contenu** : les prospects entrent au carnet uniquement par une recherche du bot
  (`search_actions`), recopiés par le serveur depuis un enregistrement renvoyé par le lieu, `source_ref` revérifié.
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

from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.orm import Session, sessionmaker

from ..deps import hash_token
from ..errors import ApiError, ErrorCode
from ..models import (
    GameSession,
    Prospect,
    ProspectIdempotency,
    utcnow,
)
from ..models_drafts import ProspectDraft
from ..rules_v2 import RulesV2
from ..schemas.prospects import (
    CanalOut,
    ProspectDetailOut,
    ProspectListOut,
    ProspectOut,
    ProspectPatchIn,
    StatutEvent,
)
from . import clients, ledger
from . import prospects_build as build
from .purchases import REUSED_KEY, request_hash

log = logging.getLogger("rubix.prospects")

FIABILITES = ("verifie", "partiel", "simule")
ETIQUETTES = ("correspond", "a_verifier", "hors_cible")
SORTS = ("pertinence", "date_ajout", "entreprise", "statut", "fiabilite", "source", "etiquette")


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
        pertinence=row.pertinence, pertinence_etiquette=row.pertinence_etiquette or "a_verifier", pertinence_citation=row.pertinence_citation,
        fiabilite=row.fiabilite, simule=row.simule, statut=row.statut, notes=row.notes,
        collecte_le=row.collecte_le, search_id=row.search_id,
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
    from . import prospect_actions

    versions = prospect_actions.versions(db, row.id)
    fiches = [prospect_actions.draft_out(v).model_dump(mode="json") for v in versions if v.kind == "fiche"]
    brouillons = [prospect_actions.draft_out(v).model_dump(mode="json") for v in versions if v.kind == "message"]
    return ProspectDetailOut(
        **base.model_dump(), instantane_source=dict(row.instantane or {}), historique_statut=hist, fiches=fiches, brouillons=brouillons
    )


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


# ---------------------------------------------------------------- lecture (API-I3)


@dataclass(frozen=True)
class Filters:
    statut: str | None = None
    source: str | None = None
    fiabilite: str | None = None
    etiquette: str | None = None
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
    if f.etiquette is not None and f.etiquette not in ETIQUETTES:
        raise ApiError(ErrorCode.INVALID_REQUEST, "Étiquette inconnue.")
    w: list = [Prospect.session_id == session_id]
    if f.etiquette == "a_verifier":  # jamais triée = « à vérifier »
        w.append(or_(Prospect.pertinence_etiquette == "a_verifier", Prospect.pertinence_etiquette.is_(None)))
    elif f.etiquette is not None:
        w.append(Prospect.pertinence_etiquette == f.etiquette)
    if f.statut is not None:
        w.append(Prospect.statut == f.statut)
    if f.source is not None:
        w.append(Prospect.source == f.source)
    if f.fiabilite is not None:
        w.append(Prospect.fiabilite == f.fiabilite)
    for flag, kind in ((f.avec_fiche, "fiche"), (f.avec_brouillon, "message")):  # fiche client / brouillon de premier message
        if flag is not None:
            has = select(ProspectDraft.id).where(ProspectDraft.prospect_id == Prospect.id, ProspectDraft.kind == kind).exists()
            w.append(has if flag else ~has)
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
    if tri == "etiquette":  # correspond, puis à vérifier (dont jamais trié), puis hors cible
        return case((Prospect.pertinence_etiquette == "correspond", 0), (Prospect.pertinence_etiquette == "hors_cible", 2), else_=1)
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
    if tri == "etiquette":
        return {"correspond": 0, "hors_cible": 2}.get(row.pertinence_etiquette or "", 1)
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
            if payload.statut == "gagne":  # seul chemin vers le gain « client obtenu » (API-S4) ; refuse sans réponse du prospect
                clients.claim(db, rules, session_id, row.id)
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
        from .conversations import delete_for_prospect

        delete_for_prospect(db, session_id, prospect_id)  # cascade : conversations, messages, brouillons, synthèses
        from . import prospect_actions

        prospect_actions.delete_for_prospect(db, session_id, prospect_id)  # fiches clients, premiers messages, compteurs de quota
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
        from . import prospect_actions
        from .conversations import delete_for_prospect

        for pid in list(db.scalars(select(Prospect.id).where(Prospect.session_id == session_id))):
            delete_for_prospect(db, session_id, pid)
            prospect_actions.delete_for_prospect(db, session_id, pid)
        n = db.execute(delete(Prospect).where(Prospect.session_id == session_id)).rowcount or 0
        _remember(db, session_id, key_hash, req_hash, 204, None)
        db.commit()
    log.info("prospects_purge", extra={"event": "prospects_purge", "count": n})
    return n
