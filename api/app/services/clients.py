"""Clients obtenus (API-S4, docs/PARCOURS-BOT.md §7) : l'économie et la progression ne dépendent plus d'un score.

Un client obtenu = un prospect du carnet qui accepte la démarche (statut `gagne`). Le joueur gagne alors
`rules_v2.client_reward` $, UNE SEULE FOIS par prospect : écriture de ledger de source unique
`client:<session>:<prospect>` (`ledger.post_entry` est idempotent). Le compteur de clients obtenus compte ces écritures
(source de vérité = le ledger, pas le statut courant) : repasser de `gagne` à autre chose puis revenir ne repaie pas et
ne baisse jamais le compteur. Seul `prospects.patch_prospect` appelle `claim` (aucun second chemin).

Garde-fous : le statut `gagne` n'est accepté que si la conversation du prospect contient au moins un message REÇU du
prospect (simulé en Tutoriel, importé en Réel) ET si le prospect ne s'est pas désinscrit (conversation `opted_out`)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ApiError, ErrorCode
from ..models import Conversation, ConversationMessage, LedgerEntry
from ..rules_v2 import RulesV2
from . import ledger


def source_of(session_id: str, prospect_id: str) -> str:
    return f"client:{session_id}:{prospect_id}"


def obtained_count(db: Session, session_id: str) -> int:
    """Prospects distincts déjà payés (une écriture `client_reward` POSTED par prospect, jamais supprimée)."""
    return db.scalar(
        select(func.count()).select_from(LedgerEntry).where(
            LedgerEntry.session_id == session_id, LedgerEntry.category == ledger.CATEGORY_CLIENT, LedgerEntry.state == "POSTED"
        )
    )


def _has_reply(db: Session, session_id: str, prospect_id: str) -> bool:
    return db.scalar(
        select(func.count()).select_from(ConversationMessage).join(Conversation, Conversation.id == ConversationMessage.conversation_id)
        .where(Conversation.session_id == session_id, Conversation.prospect_id == prospect_id, ConversationMessage.sens == "recu")
    ) > 0


def _opted_out(db: Session, session_id: str, prospect_id: str) -> bool:
    return bool(
        db.scalar(
            select(func.count()).select_from(Conversation)
            .where(Conversation.session_id == session_id, Conversation.prospect_id == prospect_id, Conversation.opted_out.is_(True))
        )
    )


def claim(db: Session, rules: RulesV2, session_id: str, prospect_id: str) -> bool:
    """Appelé quand un prospect passe à `gagne`, dans la transaction d'écriture de l'appelant (sans commit).
    Retourne True si le gain vient d'être écrit. Refuse (INVALID_STATE) si le prospect n'a jamais répondu et n'a pas déjà été payé."""
    already = db.scalar(select(LedgerEntry.id).where(LedgerEntry.source_action == source_of(session_id, prospect_id)))
    if already is None and _opted_out(db, session_id, prospect_id):  # opposition respectée : jamais de gain sur une désinscription
        raise ApiError(ErrorCode.INVALID_STATE, "Ce prospect a demandé à ne plus être contacté : il ne peut pas être compté comme client.")
    if already is None and not _has_reply(db, session_id, prospect_id):
        raise ApiError(
            ErrorCode.INVALID_STATE,
            "Ce prospect n'a pas encore répondu : vous ne pouvez le marquer comme client qu'après sa réponse.",
        )
    _, created = ledger.post_entry(db, session_id, rules.client_reward, ledger.CATEGORY_CLIENT, source_of(session_id, prospect_id))
    return created
