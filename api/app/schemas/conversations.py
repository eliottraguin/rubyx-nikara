"""Schémas de la messagerie (docs/CONTRACTS.md §5, PRODUIT-CLIENTS-PUB.md §3).

Tous les textes (messages, brouillons, synthèses) sont des contenus **non fiables** : l'interface les rend en texte.
L'adresse ou le numéro du prospect n'apparaît dans aucun de ces schémas (l'écran de confirmation d'envoi réel, jalon O,
la lira côté serveur)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .actions import ActionOut

Bac = Literal["a_traiter", "en_attente", "a_ne_plus_contacter", "clos"]
Intention = Literal["interesse", "question", "objection", "refus", "desinscription", "hors_sujet"]


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prospect_id: str = Field(min_length=1, max_length=64)


class Controle(BaseModel):
    id: str
    label: str
    essentiel: bool
    reussi: bool
    detail: str | None = None


class ConversationOut(BaseModel):
    id: str
    prospect_id: str
    simule: bool
    statut_prospect: str | None = None
    entreprise: str | None = None
    etat: Literal["ouverte", "close", "desinscrit"]
    bac: Bac
    intention: Intention | None = None  # dernière synthèse
    dernier_message_le: datetime | None
    tours_client: int
    tours_client_max: int
    created_at: datetime


class ConversationMessageOut(BaseModel):
    id: str
    seq: int
    sens: Literal["envoye", "recu"]
    etat: Literal["ENVOYE", "NON_ENVOYE"] | None = None
    text: str
    simule: bool
    draft_version_id: str | None = None
    created_at: datetime


class SynthesisPoint(BaseModel):
    texte: str
    citation: str


class SynthesisOut(BaseModel):
    id: str
    intention: Intention
    points: list[SynthesisPoint]
    urgence: Literal["faible", "normale", "elevee"]
    statut_suggere: str | None
    desinscription_detectee_par_code: bool
    controles: list[Controle]
    action_id: str | None
    created_at: datetime


class ReplyDraftOut(BaseModel):
    id: str
    parent_id: str | None
    auteur: Literal["agent", "joueur"]
    objet: str | None
    corps: str
    a_verifier: list[str]
    controles: list[Controle]
    action_id: str | None
    created_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[ConversationMessageOut]
    synthese: SynthesisOut | None
    brouillons: list[ReplyDraftOut]
    resultat: dict[str, Any] | None = Field(default=None, description="Tutoriel : résultat calculé par code, null tant que la conversation est ouverte")
    bandeau: str | None = Field(default=None, description="Mention affichée au joueur (ex. « Mode simulé : rien n'a été envoyé »)")
    quota_restant: dict[str, int] = Field(default_factory=dict, description="Générations restantes par rôle (`triage`, `replier`)")


class ConversationList(BaseModel):
    items: list[ConversationOut]
    next_cursor: str | None
    counts: dict[str, int]


class MessageSendIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    draft_version_id: str | None = Field(default=None, max_length=64, description="Brouillon dont le texte est repris (« Utiliser ce brouillon ») ; le texte envoyé est `text`")


class MessageSendOut(BaseModel):
    conversation_id: str
    messages: list[ConversationMessageOut]
    statut_prospect: str | None
    etat: Literal["ouverte", "close", "desinscrit"]
    resultat: dict[str, Any] | None = None
    client_error: dict[str, str] | None = Field(default=None, description="Le client simulé n'a pas pu répondre (rien débité) ; réessayez en envoyant un message")
    simule: bool = True


class DraftEditIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1)
    objet: str | None = Field(default=None, max_length=90)


class ActionIn(BaseModel):
    """Corps de `triage` et `reply` : consigne facultative du joueur (donnée, jamais une consigne système)."""

    model_config = ConfigDict(extra="forbid")

    instruction: str | None = Field(default=None, description="Consigne facultative (500 caractères maximum, vérifiés par le serveur)")


class SendIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_version_id: str = Field(min_length=1, max_length=64)
    confirm: bool


class ConversationActionOut(ActionOut):
    """`ActionOut` + le résultat de l'action de messagerie (synthèse ou brouillon) et ses contrôles par code."""

    conversation_id: str | None = None
    synthese: SynthesisOut | None = None
    brouillon: ReplyDraftOut | None = None
