"""Schémas du moteur de campagne (BE02) et de l'API de livrables (BE05)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .common import Role
from .entities import ArtifactShareOut, ArtifactVersionOut, EvaluationOut, MessageOut, SubmissionOut

MissionStatus = Literal["LOCKED", "AVAILABLE", "ACTIVE", "EVALUATING", "COMPLETED", "FAILED"]
AttemptStatus = Literal["ACTIVE", "EVALUATING", "COMPLETED", "FAILED"]
NextActionType = Literal[
    "start_mission", "continue_attempt", "await_evaluation", "retry_mission", "start_rescue", "campaign_complete"
]

MAX_ARTIFACT_CHARS = 20_000  # borne technique d'un livrable (le prompt joueur reste limité par rules.limits)


class NextAction(BaseModel):
    type: NextActionType
    mission_id: str | None = None
    attempt_id: str | None = None
    message: str


class Progress(BaseModel):
    completed_missions: list[str]
    total_missions: int  # missions de la campagne (hors secours)
    reputation: float | None = Field(description="Moyenne des meilleurs scores des missions terminées (informative)")
    victory: bool
    stage: str
    next_action: NextAction


class AttemptSummary(BaseModel):
    id: str
    mission_id: str
    attempt_no: int
    status: AttemptStatus
    brief_version: int
    unit_price: int  # figé à l'ouverture de la tentative
    spend_cap: int | None
    message_counts: dict[str, int]
    free_credit_roles: list[Role] = Field(description="Rôles ayant encore un message gratuit (crédit de correction)")
    clarifications_used: int
    model_calls: int
    score: int | None = Field(description="Score de la dernière livraison évaluée, sinon null")
    submission_id: str | None
    artifacts_count: int
    failure_reasons: list[str] = Field(default_factory=list)
    created_at: datetime


class BriefDiffItem(BaseModel):
    field: str
    before: str
    after: str


class BriefChange(BaseModel):
    version: int
    event_id: str
    type: str | None = None
    description: str | None = None
    diff: list[BriefDiffItem] = Field(default_factory=list)


class BriefView(BaseModel):
    """Brief public de la tentative : version courante et historique des changements (diff)."""

    version: int
    content: dict[str, Any] | None = Field(description="Brief public à la version courante ; null si le contenu de mission est absent")
    changes: list[BriefChange]


class DocumentView(BaseModel):
    id: str
    title: str
    kind: str | None = None
    date: str | None = None
    authority: str | None = None
    status: str | None = None
    text: str | None = None


class AttemptDetail(BaseModel):
    """Reprise complète d'une tentative (F12) : tout ce qu'il faut pour restaurer l'atelier."""

    attempt: AttemptSummary
    mission_title: str | None = None
    content_available: bool
    brief: BriefView
    documents: list[DocumentView]
    messages: list[MessageOut]
    artifacts: list[ArtifactVersionOut]
    shares: list[ArtifactShareOut]
    submissions: list[SubmissionOut]
    evaluations: list[EvaluationOut]


class ArtifactCreate(BaseModel):
    """Version manuelle (`content`, éventuellement `parent_id` pour une édition) ou assemblage de versions existantes."""

    model_config = ConfigDict(extra="forbid")  # auteur, contributions et sources sont décidés par le serveur

    kind: Literal["manual", "assembly"] = "manual"
    type: str = Field(default="text", pattern=r"^[a-z][a-z0-9_]{0,31}$")
    content: str | None = Field(default=None, max_length=MAX_ARTIFACT_CHARS)
    parent_id: str | None = Field(default=None, max_length=64)
    part_ids: list[str] | None = Field(default=None, min_length=1, max_length=10)

    @model_validator(mode="after")
    def _shape(self) -> "ArtifactCreate":
        if self.kind == "manual":
            if self.content is None or not self.content.strip():
                raise ValueError("le contenu est obligatoire pour une version manuelle")
            if self.part_ids is not None:
                raise ValueError("part_ids n'est valable que pour un assemblage")
        else:
            if not self.part_ids or len(set(self.part_ids)) != len(self.part_ids):
                raise ValueError("un assemblage exige des versions distinctes (part_ids)")
            if self.content is not None or self.parent_id is not None:
                raise ValueError("un assemblage ne prend ni content ni parent_id")
        return self


class ShareCreate(BaseModel):
    """Partage d'une version de livrable ou d'un document du corpus avec un rôle possédé."""

    model_config = ConfigDict(extra="forbid")

    role: Role
    artifact_version_id: str | None = Field(default=None, max_length=64)
    document_id: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _one(self) -> "ShareCreate":
        if (self.artifact_version_id is None) == (self.document_id is None):
            raise ValueError("indiquer exactement un de artifact_version_id ou document_id")
        return self


class SubmitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    artifact_version_id: str = Field(max_length=64)
    brief_version: int | None = Field(
        default=None, ge=1, description="Version du brief vue par le joueur ; périmée => VERSION_CONFLICT"
    )


class SubmitOut(SubmissionOut):
    attempt_status: AttemptStatus
    replayed: bool = False


class DemoEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempt_id: str = Field(max_length=64)
    event_id: str = Field(max_length=64)


class AppliedEventView(BaseModel):
    event_id: str
    type: str | None = None
    trigger: str | None = None
    description: str | None = None
    brief_version: int
    diff: list[BriefDiffItem] = Field(default_factory=list)
    credited_roles: list[Role] = Field(default_factory=list, description="Rôles recevant un message gratuit (une fois par rôle)")
    added_documents: list[str] = Field(default_factory=list)


class DemoEventOut(BaseModel):
    demo: Literal[True] = True  # badge visible : événement injecté par le présentateur
    event: AppliedEventView
    attempt: AttemptSummary
