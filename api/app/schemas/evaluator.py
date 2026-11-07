"""Sortie du client évaluateur (docs/CONTRACTS.md). Tout champ inconnu (ex. une
récompense suggérée par le modèle) est ignoré à la validation."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CriterionResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    rating: float = Field(ge=0.0, le=1.0)
    evidence: str = ""
    comment: str = ""


class EvaluatorOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    submission_id: str
    rubric_version: str
    out_of_scope: bool = False
    criteria: list[CriterionResult] = Field(min_length=1)
    client_feedback: str
    next_action: str

    @field_validator("criteria")
    @classmethod
    def _unique_ids(cls, v: list[CriterionResult]) -> list[CriterionResult]:
        ids = [c.id for c in v]
        if len(set(ids)) != len(ids):
            raise ValueError("identifiant de critère dupliqué")
        return v

    # La complétude (tous les critères de la grille) et la validité des preuves
    # dépendent de la grille figée : contrôlées par le serveur en BE06.
