from __future__ import annotations

from ..schemas.common import ErrorResponse

ERRORS = {
    401: {"model": ErrorResponse, "description": "SESSION_REQUIRED"},
    404: {"model": ErrorResponse, "description": "NOT_FOUND"},
    409: {"model": ErrorResponse, "description": "INSUFFICIENT_FUNDS, MESSAGE_LIMIT, ROLE_LOCKED, INVALID_STATE, VERSION_CONFLICT"},
    422: {"model": ErrorResponse, "description": "INVALID_REQUEST ou INVALID_OUTPUT"},
    429: {"model": ErrorResponse, "description": "RATE_LIMITED"},
    501: {"model": ErrorResponse, "description": "NOT_IMPLEMENTED"},
    503: {"model": ErrorResponse, "description": "LLM_UNAVAILABLE"},
}
