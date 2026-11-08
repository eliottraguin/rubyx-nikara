"""Schémas d'entités exposés (docs/DATA-MODEL.md). Montants = entiers de jeu.

Les miroirs d'entités de l'ancien moteur d'expédition (mission, tentative, message, livrable, partage) et les miroirs jamais
servis par une route (partie, achat, ledger, action, appel) sont retirés (API-R3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from .common import HangarRole, Role


class _Entity(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ReservationOut(_Entity):
    id: str
    session_id: str
    action_id: str
    amount: int
    role: Role | HangarRole | None
    status: str
    expires_at: datetime
    created_at: datetime
