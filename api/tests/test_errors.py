from __future__ import annotations

import json

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.config import REPO_DIR
from app.errors import CATALOG, ApiError, ErrorCode
from app.main import create_app

from .conftest import KEY, new_key

CONTRACT_CODES = {
    "INSUFFICIENT_FUNDS": 409,
    "MESSAGE_LIMIT": 409,
    "ROLE_LOCKED": 409,
    "INVALID_STATE": 409,
    "VERSION_CONFLICT": 409,
    "INVALID_OUTPUT": 422,
    "LLM_UNAVAILABLE": 503,
}


def assert_error_shape(r, code: str, status: int):
    assert r.status_code == status
    body = r.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


@pytest.mark.parametrize("code,status", CONTRACT_CODES.items())
def test_catalog_matches_contract(code, status):
    assert CATALOG[ErrorCode(code)][0] == status


@pytest.mark.parametrize("code", CONTRACT_CODES)
def test_handler_returns_stable_code_in_french(settings, code):
    app = create_app(settings)
    router = APIRouter()

    @router.get("/boom")
    def boom():
        raise ApiError(ErrorCode(code))

    app.include_router(router)
    with TestClient(app) as c:
        r = c.get("/boom")
    assert_error_shape(r, code, CONTRACT_CODES[code])
    assert any(ch in r.json()["error"]["message"] for ch in "éèàùçô ")  # texte français


def test_unhandled_exception_is_generic(settings):
    app = create_app(settings)
    router = APIRouter()

    @router.get("/crash")
    def crash():
        raise RuntimeError("SECRET-INTERNE sk-123 prompt système")

    app.include_router(router)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/crash")
    assert_error_shape(r, "INTERNAL_ERROR", 500)
    assert "SECRET-INTERNE" not in r.text and "sk-123" not in r.text


def test_unknown_route_and_method(client):
    assert_error_shape(client.get("/api/nope"), "NOT_FOUND", 404)
    assert_error_shape(client.put("/api/state"), "INVALID_REQUEST", 422)


def test_validation_error_does_not_echo_input(client):
    secret = "valeur-sensible-123"
    r = client.post("/api/sessions", json={"company_name": "X", "mode": secret, "balance": 999}, headers=KEY)
    assert_error_shape(r, "INVALID_REQUEST", 422)
    assert secret not in r.text
    assert r.json()["error"]["details"]


def test_client_cannot_set_balance(client):
    r = client.post("/api/sessions", json={"company_name": "X", "mode": "expert", "balance": 999}, headers=KEY)
    assert_error_shape(r, "INVALID_REQUEST", 422)


def test_mutations_require_idempotency_key(client, make_session):
    r = client.post("/api/sessions", json={"company_name": "X", "mode": "expert"})
    assert_error_shape(r, "INVALID_REQUEST", 422)
    assert "Idempotency-Key" in r.json()["error"]["message"]
    bad = client.post("/api/sessions", json={"company_name": "X", "mode": "expert"}, headers={"Idempotency-Key": "court"})
    assert_error_shape(bad, "INVALID_REQUEST", 422)
    make_session(client)
    assert_error_shape(client.delete("/api/session"), "INVALID_REQUEST", 422)
    assert client.get("/api/state").status_code == 200  # la partie n'a pas été supprimée


STUBS = [
    ("POST", "/api/notebook"),
    ("GET", "/api/notebook"),
]


@pytest.mark.parametrize("method,path", STUBS)
def test_unimplemented_routes_return_501(client, method, path):
    headers = new_key(9) if method == "POST" else {}
    r = client.request(method, path, headers=headers)
    assert_error_shape(r, "NOT_IMPLEMENTED", 501)


def test_error_fixtures_match_catalog():
    for code in ErrorCode:
        data = json.loads((REPO_DIR / "data" / "fixtures" / "errors" / f"{code.value}.json").read_text())
        assert data["http_status"] == CATALOG[code][0]
        assert data["body"]["error"]["code"] == code.value
