"""BE07 : tests critiques transverses (docs/RECETTE.md T02-T07, T09-T10, T13 ; CLAUDE.md règles 1-6).

Complète les tests par module : ici, du vrai parallélisme (threads + clients HTTP) sur SQLite, un balayage de TOUTES
les routes (propriété de session), l'absence de fuite de clé/prompt et l'idempotence « même clé, autre corps ».
Les tests de livraison, d'évaluateur hostile, de paiement, d'événements versionnés puis de tentative, de livrable et
de message d'expédition sont retirés avec l'ancien parcours (API-R2, API-R3) : les mêmes garanties sont éprouvées sur la
fiche client et le premier message du rôle `replier` (prospect du carnet). Fournisseur simulé uniquement, aucun réseau."""

from __future__ import annotations

import io
import json
import logging
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import REPO_DIR, Settings
from app.llm.base import LLMAdapter, LLMResponse, LLMStatus, Usage
from app.main import create_app
from app.models import Base, LedgerEntry, TargetActionUse

from ._campaign_support import Player
from .actions_support import World
from .prospects_support import Expedition, annuaire, lead, second_client

DATA = REPO_DIR / "data"
API_KEY = "sk-FUITE-0123456789abcdef"
PROMPT_MARK = "PROMPT-SYSTEME-CONFIDENTIEL"
DEMO_SECRET = "secret-de-demo-0123456789"


# ------------------------------------------------------------------ outils


@pytest.fixture
def data_dir(tmp_path):
    d = tmp_path / "data"
    shutil.copytree(DATA, d)  # données réelles (lieux, sources, personas…) : la recherche et la messagerie en ont besoin
    return d


def realworld(tmp_path, data_dir, llm=None, mode: str = "beginner", **settings) -> World:
    """Une partie (avec ses accès directs à la base) sur une application aux données réelles copiées."""
    w = World(Settings(db_path=tmp_path / "be07.db", data_dir=data_dir, **settings), llm, mode=mode)
    w.own("replier")
    return w


def add_prospect(w: World, i: int = 1) -> str:
    r = Expedition(w, records=[("annuaire", annuaire(i))], leads=[lead(i)]).add([0])
    assert r.status_code == 201, r.text
    return r.json()["added"][0]["id"]


def real_app(tmp_path, data_dir, llm=None, **settings):
    app = create_app(Settings(db_path=tmp_path / "be07.db", data_dir=data_dir, **settings))
    if llm is not None:
        app.state.llm = llm
    return app


def grant(app, session_id: str, amount: int) -> None:
    with app.state.session_factory() as db:
        db.add(LedgerEntry(session_id=session_id, amount=amount, category="test", source_action=f"grant-{session_id}-{amount}"))
        db.commit()


def clients_of(p: Player, n: int) -> list[TestClient]:
    """n navigateurs indépendants partageant le cookie du joueur (un TestClient par thread)."""
    out = []
    for _ in range(n):
        c = TestClient(p.app)
        c.cookies.update(p.http.cookies)
        out.append(c)
    return out


def parallel(n: int, fn):
    """Lance fn(i) dans n threads démarrés ensemble (barrière) ; retourne les résultats dans l'ordre."""
    barrier = threading.Barrier(n)

    def run(i):
        barrier.wait()
        return fn(i)

    with ThreadPoolExecutor(n) as pool:
        return list(pool.map(run, range(n)))


def ledger_total(app, session_id: str) -> int:
    with app.state.session_factory() as db:
        return db.scalar(select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(LedgerEntry.session_id == session_id))


def count(app, model, *where) -> int:
    with app.state.session_factory() as db:
        return db.scalar(select(func.count()).select_from(model).where(*where))


def dump_database(app) -> str:
    """Tout le contenu textuel de la base : pour prouver qu'un secret n'y a jamais été écrit."""
    parts = []
    with app.state.session_factory() as db:
        for table in Base.metadata.sorted_tables:
            for row in db.execute(select(table)).mappings():
                parts.append(json.dumps({k: str(v) for k, v in row.items()}, ensure_ascii=False))
    return "\n".join(parts)


# ------------------------------------------------------------------ idempotence : même clé, autre corps


def test_same_key_different_role_purchase_is_a_single_debit(tmp_path, data_dir):
    app = real_app(tmp_path, data_dir)
    with TestClient(app):
        p = Player(app, "expert")  # Réel : la condition de clients est levée, seul le prix reste
        grant(app, p.session_id, 20)
        assert p.state()["balance"]["booked"] == 50
        key = {"Idempotency-Key": "purchase-samekey-01"}
        a = p.http.post("/api/agents/purchase", json={"role": "triage"}, headers=key)
        b = p.http.post("/api/agents/purchase", json={"role": "triage"}, headers=key)
        c = p.http.post("/api/agents/purchase", json={"role": "replier"}, headers=key)  # autre corps, même clé
        assert a.status_code == 201 and b.status_code in (200, 201) and b.json() == a.json()
        assert c.status_code in (409, 422)
        assert p.state()["balance"]["booked"] == 50 - 35  # prix du trieur, une seule fois


def test_double_send_of_a_generation_with_the_same_key_has_no_duplicate_effect(tmp_path, data_dir):
    w = realworld(tmp_path, data_dir)
    try:
        pid = add_prospect(w)
        key = {"Idempotency-Key": "double-send-key-001"}
        a = w.client.post(f"/api/prospects/{pid}/message", headers=key)
        b = w.client.post(f"/api/prospects/{pid}/message", headers=key)
        assert a.status_code == 202 and b.status_code == 202 and a.json()["id"] == b.json()["id"]
        assert w.balance()["booked"] == 30 - 2  # un seul débit
        with w.sf() as db:
            assert db.scalar(select(TargetActionUse.used).where(TargetActionUse.target_id == pid)) == 1
    finally:
        w.close()


# ------------------------------------------------------------------ propriété de session sur TOUTES les routes (T13)

PUBLIC = {("GET", "/api/health"), ("GET", "/api/ready"), ("POST", "/api/sessions"), ("POST", "/api/auth/signup"), ("POST", "/api/auth/login"), ("POST", "/api/auth/logout")}  # logout : idempotent, sans cookie rien à révoquer
SECRET_ROUTES = {"/api/demo/reset", "/api/ops/usage"}  # protégées par un secret serveur, cachées (404)
BODIES = {
    "/api/agents/purchase": {"role": "triage"},
}


def _routes(app):
    for path, ops in app.openapi()["paths"].items():
        for method in ops:
            if method.upper() in ("GET", "POST", "PUT", "PATCH", "DELETE") and (method.upper(), path) not in PUBLIC:
                yield method.upper(), path


def _call(client, method, path, headers=None):
    url = path.replace("{action_id}", "act_x0000000000")
    hdr = {"Idempotency-Key": "sweep-key-00000001", **(headers or {})}
    body = BODIES.get(path)
    return client.request(method, url, json=body, headers=hdr)


def test_every_route_requires_the_session_cookie(tmp_path, data_dir):
    app = real_app(tmp_path, data_dir, demo_secret=DEMO_SECRET)
    with TestClient(app) as anon:
        seen = 0
        for method, path in _routes(app):
            seen += 1
            r = _call(anon, method, path)
            if path in SECRET_ROUTES:
                assert r.status_code in (401, 403, 404), (method, path, r.status_code)
            else:
                assert r.status_code == 401, (method, path, r.status_code, r.text)
            assert "pro_" not in r.text and "act_" not in r.text.replace("act_x0000000000", "")  # aucune donnée de partie
        assert seen >= 15
        assert not any("/attempts" in path or "/missions" in path for _, path in _routes(app))  # ancien moteur retiré


def test_cookie_of_another_session_never_reaches_foreign_data(tmp_path, data_dir):
    w = realworld(tmp_path, data_dir)
    try:
        pid = add_prospect(w)
        out = w.client.patch(f"/api/prospects/{pid}", json={"version": 1, "notes": "Secret de A"}, headers=w.key())
        assert out.status_code == 200
        act = w.client.post(f"/api/prospects/{pid}/profile", headers=w.key()).json()["id"]
        other = second_client(w)
        snapshot = (w.client.get(f"/api/prospects/{pid}").json(), w.client.get("/api/state").json())
        paths = {
            ("GET", f"/api/prospects/{pid}"): None,
            ("PATCH", f"/api/prospects/{pid}"): {"version": 1, "notes": "intrus"},
            ("DELETE", f"/api/prospects/{pid}"): None,
            ("POST", f"/api/prospects/{pid}/profile"): None,
            ("POST", f"/api/prospects/{pid}/message"): None,
            ("POST", f"/api/prospects/{pid}/contact"): None,
            ("GET", f"/api/prospects/{pid}/drafts"): None,
            ("GET", f"/api/actions/{act}"): None,
        }
        for i, ((method, path), body) in enumerate(paths.items()):
            real = other.request(method, path, json=body, headers={"Idempotency-Key": f"foreign-key-{i:06d}"})
            ghost_path = path.replace(pid, "pro_inexistant0000").replace(act, "act_inexistant000")
            ghost = other.request(method, ghost_path, json=body, headers={"Idempotency-Key": f"ghost-key-{i:07d}"})
            assert real.status_code == 404 and (real.status_code, real.json()) == (ghost.status_code, ghost.json()), (method, path, real.status_code, real.text)
            assert "Secret de A" not in real.text
        # A est strictement intact : rien n'a été écrit, rien n'a été débité
        assert (w.client.get(f"/api/prospects/{pid}").json(), w.client.get("/api/state").json()) == snapshot
        assert other.get("/api/state").json()["balance"]["booked"] == 30
        assert other.get("/api/prospects").json()["items"] == []
    finally:
        w.close()


def test_deleting_a_session_invalidates_its_cookie_and_spares_others(tmp_path, data_dir):
    app = real_app(tmp_path, data_dir)
    with TestClient(app):
        a, b = Player(app, name="A"), Player(app, name="B")
        assert a.http.delete("/api/session", headers=a.key()).status_code == 204
        assert a.http.get("/api/state").status_code == 401
        assert b.state()["balance"]["booked"] == 30


# ------------------------------------------------------------------ aucune clé / aucun prompt système dans erreurs, journaux, base


class LeakyLLM(LLMAdapter):
    """Fournisseur dont les pannes embarquent la clé API et le prompt système dans le message d'erreur."""

    name = "leaky"
    simulated = True
    mode = "raise"

    async def generate(self, request):
        if self.mode == "raise":
            raise RuntimeError(f"401 Unauthorized key={API_KEY} system={PROMPT_MARK}")
        return LLMResponse(content=f"erreur {API_KEY} {PROMPT_MARK}", usage=Usage(input_tokens=1, output_tokens=1, measured=False),
                           duration_ms=1, provider_call_id=f"leak_{API_KEY}", status=LLMStatus.ERROR)


@pytest.mark.parametrize("mode", ["raise", "error_response"])
def test_provider_failures_never_leak_key_or_prompt(tmp_path, data_dir, mode):
    llm = LeakyLLM()
    llm.mode = mode
    buf = io.StringIO()
    w = realworld(tmp_path, data_dir, llm, llm_api_key=API_KEY)
    try:
        logger = logging.getLogger("rubix")
        for h in logger.handlers:
            h.stream = buf
        root_buf = io.StringIO()
        handler = logging.StreamHandler(root_buf)
        logging.getLogger().addHandler(handler)
        try:
            pid = add_prospect(w)
            r = w.client.post(f"/api/prospects/{pid}/message", headers=w.key())
            assert r.status_code == 503 and r.json()["error"]["code"] == "LLM_UNAVAILABLE"
            outputs = [r.text, w.client.get(f"/api/prospects/{pid}").text, w.client.get(f"/api/prospects/{pid}/drafts").text,
                       w.client.get("/api/state").text, w.client.get("/api/health").text, buf.getvalue(), root_buf.getvalue(), dump_database(w.app)]
        finally:
            logging.getLogger().removeHandler(handler)
        for text in outputs:
            assert API_KEY not in text and PROMPT_MARK not in text and "Unauthorized" not in text
        assert w.balance()["booked"] == 30  # rien de débité sans réponse exploitable
    finally:
        w.close()


def test_real_role_prompts_and_key_are_not_in_any_game_response(tmp_path, data_dir):
    role = json.loads((DATA / "roles" / "replier.json").read_text(encoding="utf-8"))
    marker = str(role["identity"])[:60]
    w = realworld(tmp_path, data_dir, llm_api_key=API_KEY)
    try:
        pid = add_prospect(w)
        m = w.client.post(f"/api/prospects/{pid}/message", headers=w.key())
        assert m.status_code == 202
        blob = "\n".join([m.text, w.client.get(f"/api/prospects/{pid}").text, w.client.get(f"/api/prospects/{pid}/drafts").text,
                          json.dumps(w.client.get("/api/state").json()), w.client.get(f"/api/actions/{m.json()['id']}").text,
                          w.client.get("/api/health").text])
        assert marker not in blob and API_KEY not in blob
        assert API_KEY not in dump_database(w.app)
    finally:
        w.close()


# ------------------------------------------------------------------ concurrence mixte : le solde est toujours expliqué par le registre (T02, T06)


def test_mixed_concurrency_keeps_balance_and_quota_consistent(tmp_path, data_dir):
    w = realworld(tmp_path, data_dir, mode="expert")
    try:
        pid = add_prospect(w)
        cs = []
        for _ in range(12):
            c = TestClient(w.app)
            c.cookies.update(w.client.cookies)
            cs.append(c)

        def act(i):
            h = {"Idempotency-Key": f"mixed-{i:03d}-{i:08d}"}
            if i < 8:
                return "gen", cs[i].post(f"/api/prospects/{pid}/message", json={"instruction": f"Variante {i}"}, headers=h)
            return "buy", cs[i].post("/api/agents/purchase", json={"role": "triage"}, headers=h)

        res = parallel(12, act)
        assert all(r.status_code < 500 for _, r in res), [(k, r.status_code, r.text) for k, r in res if r.status_code >= 500]
        state = w.client.get("/api/state").json()
        assert state["balance"]["available"] >= 0 and state["balance"]["booked"] >= 0 and state["balance"]["reserved"] == 0
        assert state["balance"]["booked"] == ledger_total(w.app, w.sid)  # chaque variation est expliquée
        with w.sf() as db:
            row = db.scalar(select(TargetActionUse).where(TargetActionUse.target_id == pid))
            assert row.used <= 5 and row.reserved == 0  # jamais 6
            sources = db.scalars(select(LedgerEntry.source_action).where(LedgerEntry.category.in_(("reward", "purchase", "spend", "action_cost")))).all()
            assert len(sources) == len(set(sources))  # un seul débit par source
    finally:
        w.close()
