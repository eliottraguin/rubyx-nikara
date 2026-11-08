"""Outils de test du carnet : une recherche factice avec ses enregistrements de source et ses leads."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import GameSession, Prospect, utcnow
from app.models_search import Search
from app.services import profile as profile_svc
from app.services import prospects as prospects_svc
from app.services import prospects_build as build
from tests.actions_support import World


def k() -> dict[str, str]:
    return {"Idempotency-Key": f"pro-{uuid.uuid4().hex}"}


def annuaire(i: int, **over) -> dict:
    rec = {
        "source_ref": f"ann_{i:04d}", "entreprise": f"Boulangerie {i}", "collecte_le": "2026-10-01", "secteur": "Commerce de détail",
        "ville": "Lyon", "adresse_pro": f"{i} rue de la République", "telephone_standard": "04 78 00 00 00",
        "email_generique": f"contact{i}@exemple.test", "site_web": "https://exemple.test",
    }
    rec.update(over)
    return rec


def lead(i: int, source: str = "annuaire", **over) -> dict:
    out = {"source": source, "source_ref": f"ann_{i:04d}", "signal": "Ouverture récente", "raisons_fit": ["Secteur conforme"], "contact": "gérant"}
    out.update(over)
    return out


class Expedition:
    """Une « recherche » factice de la partie de `w` : enregistrements renvoyés par la source et leads rapportés.

    `add(positions)` recopie les leads au carnet comme le fait la recherche du bot (`search_actions.execute`) : champs
    construits par `prospects_build.build_prospect_fields` depuis l'enregistrement renvoyé (jamais depuis le lead),
    `source_ref` revérifié, dédoublonnage `(session, source, source_ref)`. Réponse : objet à la manière d'un `Response`
    (`status_code`, `json()` = `{added, already_present, refused}`). Le navigateur n'a plus de route d'ajout : ce
    n'est qu'un outil de test pour préparer un carnet."""

    def __init__(self, w: World, records: list[tuple[str, dict]] | None = None, leads: list[dict] | None = None, n: int = 5, **kw):
        self.w = w
        self.profile_version = kw.pop("profile_version", 1)
        assert not kw, kw
        self.records = records if records is not None else [("annuaire", annuaire(i)) for i in range(1, n + 1)]
        self.leads = leads if leads is not None else [lead(i) for i in range(1, n + 1)]
        with w.sf() as db:
            row = Search(session_id=w.sid, planet_id="annuaire", status="DONE", profile_version=self.profile_version, simule=True)
            db.add(row)
            db.commit()
            self.search_id = row.id

    def add(self, positions, client: TestClient | None = None, headers=None) -> _Result:
        w = self.w
        sources = w.app.state.sources_spec
        spec = w.app.state.profile_spec
        with w.sf() as db:
            game = db.get(GameSession, w.sid)
            profile = profile_svc.version_row(db, w.sid, self.profile_version)
            created: list[Prospect] = []
            already: list[str] = []
            refused: list[dict] = []
            for pos in dict.fromkeys(positions):
                ld = self.leads[pos] if 0 <= pos < len(self.leads) else None
                match = None
                if ld is not None and isinstance(ld.get("source_ref"), str):
                    found = [(s, r) for s, r in self.records if r.get("source_ref") == ld["source_ref"] and (ld.get("source") in (None, s))]
                    if len(found) == 1 and sources.known(found[0][0]):
                        match = found[0]
                fields = None
                if match is not None:
                    src, rec = match
                    exists = db.scalar(select(Prospect).where(Prospect.session_id == w.sid, Prospect.source == src, Prospect.source_ref == rec["source_ref"]))
                    if exists is not None:
                        already.append(exists.id)
                        continue
                    fields = build.build_prospect_fields(
                        sources=sources, source=src, record=rec, lead=ld, profile=profile, spec_sectors=spec.sectors, simulated=game.mode != "expert"
                    )
                if fields is None or match is None:
                    refused.append({"position": pos, "code": "LEAD_UNVERIFIED"})
                    continue
                now = utcnow()
                row = Prospect(
                    session_id=w.sid, source=match[0], source_ref=match[1]["source_ref"], search_id=self.search_id,
                    profile_version=self.profile_version, statut="nouveau", notes="", historique=[{"statut": "nouveau", "le": now.isoformat()}],
                    cree_le=now, modifie_le=now, derniere_activite_le=now, version=1, **fields,
                )
                db.add(row)
                db.flush()
                created.append(row)
            db.commit()
            added = [o.model_dump(mode="json") for o in prospects_svc._outs(db, w.sid, created)]
        return _Result(201 if created else 200, {"added": added, "already_present": already, "refused": refused})


class _Result:
    def __init__(self, status_code: int, body: dict):
        self.status_code, self._body = status_code, body
        self.text = json.dumps(body)

    def json(self) -> dict:
        return self._body


def world(settings, mode: str = "beginner") -> World:
    return World(settings, mode=mode)


def second_client(w: World, mode: str = "beginner") -> TestClient:
    """Une 2e partie (autre cookie) sur la même application."""
    c = TestClient(w.app)
    r = c.post("/api/sessions", json={"company_name": "Autre Atelier", "mode": mode}, headers=k())
    assert r.status_code == 201, r.text
    return c


def copy_with_limits(data_copy: Path, **limits: int):
    from app.config import Settings

    path = data_copy / "rules" / "rules_v2.json"
    rules = json.loads(path.read_text(encoding="utf-8"))
    rules["limits"].update(limits)
    path.write_text(json.dumps(rules), encoding="utf-8")
    return Settings(db_path=data_copy.parent / "limits_copy.db", data_dir=data_copy)


def give_reply(w: World, prospect_id: str) -> None:
    """Conversation du prospect avec un message REÇU (condition du passage à `gagne`, API-S4)."""
    from app.models import Conversation, ConversationMessage

    with w.sf() as db:
        conv = Conversation(session_id=w.sid, prospect_id=prospect_id)
        db.add(conv)
        db.flush()
        db.add(ConversationMessage(conversation_id=conv.id, seq=1, sens="recu", text="Intéressé."))
        db.commit()
