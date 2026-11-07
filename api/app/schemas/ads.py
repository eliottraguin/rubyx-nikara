"""Schémas de la section Pub (docs/CONTRACTS.md §7 : campagnes et kits). Les bornes fines (limites de caractères par
format, nombre d'accroches…) viennent de `data/` et sont contrôlées par code (`services/ad_kit.py`) ; les bornes
ci-dessous ne sont que des garde-fous de taille."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

_SAFE = 4000  # garde-fou de taille d'une valeur (jamais la limite métier)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ kit de campagne


class Accroche(_Strict):
    texte: str = Field(max_length=_SAFE)
    fiche: str = Field(max_length=64, description="Champ de la fiche entreprise auquel l'accroche se rattache (ex. `offre`)")


class TexteFormat(_Strict):
    format: str = Field(max_length=64, description="Identifiant d'un format de la plateforme (data/ads/formats.json)")
    champs: dict[str, list[str]] = Field(description="Un ou plusieurs textes par champ du format (titres multiples pour Google)")


class BriefVisuel(_Strict):
    sujet: str = Field(max_length=_SAFE)
    style: str = Field(max_length=_SAFE)
    texte_image: str = Field(max_length=_SAFE)
    format_dimensions: str = Field(max_length=_SAFE)
    prompt: str = Field(max_length=_SAFE, description="Prompt prêt à coller dans un outil d'image (aucune image n'est générée)")


class PlanKit(_Strict):
    calendrier: list[str] = Field(max_length=50)
    repartition_budget: list[str] = Field(max_length=50)
    indicateurs: list[str] = Field(max_length=50, description="Indicateurs de suivi, sans valeur promise")


class ChecklistRef(BaseModel):
    """Référence à un point de checklist : seul `id` compte (libellé et caractère essentiel viennent des données ; les
    autres clés, par exemple celles d'un kit relu tel que rendu, sont ignorées)."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(max_length=64, description="Identifiant d'un point de `data/ads/checklist.json`")


class AdKit(_Strict):
    """Sortie de l'agent `ads` (JSON `ad_kit`)."""

    positionnement: str = Field(max_length=_SAFE)
    audience_resume: str = Field(max_length=_SAFE)
    accroches: list[Accroche] = Field(max_length=50)
    textes: list[TexteFormat] = Field(max_length=50)
    brief_visuel: BriefVisuel
    plan: PlanKit
    checklist: list[ChecklistRef] = Field(max_length=50)
    a_verifier: list[str] = Field(max_length=50)


class ChecklistItemOut(BaseModel):
    id: str
    label: str
    essential: bool


class AdKitOut(BaseModel):
    """Kit tel que stocké et rendu : la checklist porte le libellé issu des données."""

    positionnement: str
    audience_resume: str
    accroches: list[Accroche]
    textes: list[TexteFormat]
    brief_visuel: BriefVisuel
    plan: PlanKit
    checklist: list[ChecklistItemOut]
    a_verifier: list[str]


class CheckResultOut(BaseModel):
    id: str
    label: str
    essential: bool
    passed: bool
    detail: str | None = Field(default=None, description="Raison courte de l'échec (jamais d'adresse ni de contenu sensible)")


class CampaignVersionOut(BaseModel):
    id: str
    numero: int
    parent_id: str | None
    auteur: str = Field(description="`ads` (agent) ou `joueur` (copie éditée)")
    kit: AdKitOut
    controles: list[CheckResultOut]
    consigne: str | None
    profile_version: int | None
    simule: bool = Field(description="Vrai en Tutoriel ou avec le fournisseur simulé : badge obligatoire")
    action_id: str | None
    cree_le: datetime


# ------------------------------------------------------------------ campagne


class CampaignIn(_Strict):
    nom: str = Field(max_length=_SAFE)
    objectif: str = Field(max_length=64, description="notoriete | leads | evenement | offre (data/ads/formats.json)")
    plateforme: str = Field(max_length=64, description="linkedin | meta | google_search | local | email (choix des formats seulement)")
    audience: str | None = Field(default=None, max_length=_SAFE, description="Dérivée de la fiche cible si absente (≤ 300)")
    budget_indicatif: str | None = Field(default=None, max_length=_SAFE, description="Texte indicatif : ne touche jamais la monnaie du jeu")
    consigne: str | None = Field(default=None, max_length=_SAFE)


class CampaignPatch(_Strict):
    """Seuls ces champs sont modifiables par le joueur ; `version` = compteur de concurrence lu au dernier GET."""

    version: int = Field(ge=1)
    nom: str | None = Field(default=None, max_length=_SAFE)
    objectif: str | None = Field(default=None, max_length=64)
    plateforme: str | None = Field(default=None, max_length=64)
    audience: str | None = Field(default=None, max_length=_SAFE, description="Chaîne vide : audience re-dérivée de la fiche")
    budget_indicatif: str | None = Field(default=None, max_length=_SAFE, description="Chaîne vide : efface")
    consigne: str | None = Field(default=None, max_length=_SAFE, description="Chaîne vide : efface")


class GenerateIn(_Strict):
    consigne: str | None = Field(default=None, max_length=_SAFE, description="Consigne facultative pour cette génération (≤ 500) ; sans elle, celle de la campagne")


class VersionEditIn(_Strict):
    """Copie éditée d'un kit : le kit complet, que le joueur a modifié (nouvelle version enfant, auteur `joueur`)."""

    version: int = Field(ge=1, description="Compteur de concurrence de la campagne lu au dernier GET")
    kit: AdKit


class CampaignOut(BaseModel):
    id: str
    nom: str
    objectif: str
    plateforme: str
    audience: str
    budget_indicatif: str | None
    consigne: str | None
    version: int
    versions: list[CampaignVersionOut]
    generations_remaining: int = Field(description="Générations de kit restantes (quota 5 par campagne, jamais 6)")
    generation_cost: int = Field(description="Coût d'une génération (règles serveur)")
    cree_le: datetime
    modifie_le: datetime


class CampaignSummaryOut(BaseModel):
    id: str
    nom: str
    objectif: str
    plateforme: str
    version: int
    versions_count: int
    derniere_version: int | None
    generations_remaining: int
    modifie_le: datetime


class CampaignListOut(BaseModel):
    items: list[CampaignSummaryOut]
    total: int
    max: int = Field(description="Nombre maximal de campagnes par partie (`limits.campaigns_max`)")
    generation_cost: int
