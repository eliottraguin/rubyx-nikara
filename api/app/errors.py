"""Erreurs stables (docs/CONTRACTS.md) : codes, statuts HTTP, messages en français."""

from __future__ import annotations

from enum import StrEnum

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .schemas.common import ErrorBody, ErrorResponse


class ErrorCode(StrEnum):
    # Codes du contrat (CONTRACTS.md)
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    MESSAGE_LIMIT = "MESSAGE_LIMIT"
    ROLE_LOCKED = "ROLE_LOCKED"
    INVALID_STATE = "INVALID_STATE"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    INVALID_OUTPUT = "INVALID_OUTPUT"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    LEAD_UNVERIFIED = "LEAD_UNVERIFIED"  # cap prospection : lead sans source_ref vérifiable (refus par position, 422 si levé seul)
    PLANET_LOCKED = "PLANET_LOCKED"  # 409 recherche : lieu pas encore débloqué (docs/CONTRACTS.md §11)
    PROFILE_INCOMPLETE = "PROFILE_INCOMPLETE"  # 409 recherche : fiche entreprise et cible incomplète
    OPTED_OUT = "OPTED_OUT"  # 409 messagerie : prospect écarté ou désinscrit, envoi refusé (docs/CONTRACTS.md §5)
    # Compléments BE01 (le contrat décrit ces cas sans code : à valider)
    INVALID_REQUEST = "INVALID_REQUEST"  # 422 validation d'entrée
    RATE_LIMITED = "RATE_LIMITED"  # 429 saturation
    SESSION_REQUIRED = "SESSION_REQUIRED"  # 401 cookie absent/inconnu
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"  # 401 connexion : message unique, sans énumération d'emails
    NOT_FOUND = "NOT_FOUND"  # 404 (aussi pour une ressource d'une autre session)
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"  # 501 route pas encore livrée
    INTERNAL_ERROR = "INTERNAL_ERROR"  # 500


# code -> (statut HTTP, message par défaut en français)
CATALOG: dict[ErrorCode, tuple[int, str]] = {
    ErrorCode.INSUFFICIENT_FUNDS: (409, "Solde disponible insuffisant pour cette action."),
    ErrorCode.MESSAGE_LIMIT: (409, "Le nombre maximal de messages pour cet agent est atteint pour cette tentative."),
    ErrorCode.ROLE_LOCKED: (409, "Cet agent n'est pas encore débloqué ou n'est pas possédé."),
    ErrorCode.INVALID_STATE: (409, "Cette opération n'est pas possible dans l'état actuel."),
    ErrorCode.VERSION_CONFLICT: (409, "Le brief ou la version utilisée est périmé ; rechargez l'état."),
    ErrorCode.INVALID_OUTPUT: (422, "La réponse du modèle est inexploitable, même après réparation. Rien n'a été débité."),
    ErrorCode.LLM_UNAVAILABLE: (503, "Le fournisseur de modèles est indisponible. Rien n'a été débité ; réessayez."),
    ErrorCode.LEAD_UNVERIFIED: (422, "Ce lead ne peut pas être vérifié auprès de la source : il n'est pas ajouté au carnet."),
    ErrorCode.PLANET_LOCKED: (409, "Ce lieu n'est pas encore débloqué : continuez à chercher ailleurs pour l'ouvrir."),
    ErrorCode.PROFILE_INCOMPLETE: (409, "Votre fiche entreprise et cible est incomplète : renseignez au moins votre offre, vos secteurs cibles et votre zone."),
    ErrorCode.OPTED_OUT: (409, "Ce prospect a demandé à ne plus être contacté : aucun message ne peut lui être envoyé."),
    ErrorCode.INVALID_REQUEST: (422, "Requête invalide."),
    ErrorCode.RATE_LIMITED: (429, "Trop de demandes en cours ; réessayez dans un instant."),
    ErrorCode.SESSION_REQUIRED: (401, "Aucune partie active : créez une partie ou reprenez-en une."),
    ErrorCode.INVALID_CREDENTIALS: (401, "Email ou mot de passe incorrect."),
    ErrorCode.NOT_FOUND: (404, "Ressource introuvable."),
    ErrorCode.NOT_IMPLEMENTED: (501, "Cette fonctionnalité n'est pas encore implémentée."),
    ErrorCode.INTERNAL_ERROR: (500, "Erreur interne du serveur."),
}


class ApiError(Exception):
    """Erreur métier : code stable + message français, jamais de donnée sensible."""

    def __init__(self, code: ErrorCode, message: str | None = None, details: list[dict] | None = None):
        self.code = code
        self.status_code = CATALOG[code][0]
        self.message = message or CATALOG[code][1]
        self.details = details
        super().__init__(self.message)


def error_response(code: ErrorCode, message: str | None = None, details: list[dict] | None = None) -> JSONResponse:
    err = ApiError(code, message, details)
    body = ErrorResponse(error=ErrorBody(code=err.code.value, message=err.message, details=err.details))
    return JSONResponse(status_code=err.status_code, content=body.model_dump(mode="json", exclude_none=True))


def _api_error(_: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.code, exc.message, exc.details)


def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # On ne renvoie que l'emplacement et le message : jamais la valeur reçue.
    details = [
        {"loc": [str(p) for p in e.get("loc", ())], "message": str(e.get("msg", ""))} for e in exc.errors()
    ]
    return error_response(ErrorCode.INVALID_REQUEST, details=details)


def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code == 404:
        return error_response(ErrorCode.NOT_FOUND)
    if exc.status_code >= 500:
        return error_response(ErrorCode.INTERNAL_ERROR)
    if exc.status_code == 405:
        return error_response(ErrorCode.INVALID_REQUEST, "Méthode non autorisée pour cette route.")
    return error_response(ErrorCode.INVALID_REQUEST)


def _unhandled(_: Request, __: Exception) -> JSONResponse:
    # Message volontairement générique : pas de trace, de chemin ni de contenu.
    return error_response(ErrorCode.INTERNAL_ERROR)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(Exception, _unhandled)
