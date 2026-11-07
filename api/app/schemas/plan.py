"""Plan du chef d'équipe (docs/CONTRACTS.md, RULES.md §4)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .common import Role

MAX_PLAN_STEPS = 2  # valeur de rules_v1 (quotas.max_plan_steps) ; le serveur applique la valeur chargée


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role
    task: str = Field(min_length=1, max_length=1000)
    source_ids: list[str] = Field(default_factory=list)
    depends_on: int | None = Field(default=None, ge=0, description="Index d'une étape précédente")


class LeadPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    steps: list[PlanStep] = Field(min_length=1, max_length=MAX_PLAN_STEPS)
    summary: str = Field(max_length=1000)

    @model_validator(mode="after")
    def _structure(self) -> "LeadPlan":
        for i, step in enumerate(self.steps):
            if step.role is Role.LEAD:
                raise ValueError("appel récursif chef vers chef interdit")
            # Une dépendance ne peut viser qu'une étape antérieure : graphe sans cycle.
            if step.depends_on is not None and step.depends_on >= i:
                raise ValueError("dépendance invalide (étape postérieure ou cycle)")
        return self

    # Rôles possédés et pièces appartenant à la tentative : contrôlés côté serveur (BE04/BE05).
