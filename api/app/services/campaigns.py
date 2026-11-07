"""Campagnes de pub : cycle de vie, versions de kit, copie éditée et export Markdown (docs/PRODUIT-CLIENTS-PUB.md §5).

Tout est **gratuit et jamais conditionné** par l'argent ni par le score (RULES §14). Toute lecture ou mutation vérifie la
propriété de la partie : la campagne d'une autre partie est indistinguable d'une campagne inexistante (404).
Les mutations sont rejouables par `Idempotency-Key` (journal `campaign_requests`, empreintes seulement).
Aucune publication, aucune connexion à une plateforme publicitaire, aucune dépense réelle."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from ..ads_spec import AdsSpec
from ..deps import hash_token
from ..errors import ApiError, ErrorCode
from ..models import GameSession, TargetActionUse
from ..models_pub import Campaign, CampaignRequest, CampaignVersion
from ..profile_spec import ProfileSpec
from ..rules_v2 import RulesV2
from ..schemas.ads import (
    AdKitOut,
    CampaignIn,
    CampaignListOut,
    CampaignOut,
    CampaignPatch,
    CampaignSummaryOut,
    CampaignVersionOut,
    CheckResultOut,
    VersionEditIn,
)
from . import ad_kit, ledger
from . import profile as profile_svc
from .actions import ActionEngine
from .purchases import REUSED_KEY, request_hash

ACTION = "ad_campaign"


@dataclass
class PubEngine:
    """Contexte de la section Pub : moteur d'actions (fournisseur, réservations), règles v2 et données `data/ads/`."""

    eng: ActionEngine
    rules_v2: RulesV2
    spec: AdsSpec
    profile_spec: ProfileSpec

    @property
    def sf(self) -> sessionmaker[Session]:
        return self.eng.sf


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


# ------------------------------------------------------------------ fiche entreprise (lecture)


def profile_data(db: Session, pub: PubEngine, session_id: str) -> tuple[dict[str, Any], int]:
    """Fiche courante de la partie (donnée) et son numéro de version ; vue synthétique pour une partie créée hors API."""
    row = profile_svc.current_row(db, session_id)
    if row is not None:
        return profile_svc.fill_defaults(pub.profile_spec, row.data), row.version
    game = db.get(GameSession, session_id)
    data = {"entreprise_nom": game.company.get("name", ""), "offre": game.company.get("profile") or ""}
    return profile_svc.fill_defaults(pub.profile_spec, data), 1


def derive_audience(pub: PubEngine, profile: dict[str, Any]) -> str:
    """Audience dérivée par le serveur de la fiche cible : des entreprises, des secteurs, une zone, jamais des personnes."""
    limit = pub.spec.rules.text_bounds["audience_max"]
    parts: list[str] = []
    for label, key in (("Secteurs", "cible_secteurs"), ("Zone", "cible_zone"), ("Fonctions", "cible_fonctions")):
        items = [str(x).replace("_", " ") for x in (profile.get(key) or [])]
        if items:
            parts.append(f"{label} : {', '.join(items)}")
    size = profile.get("cible_taille")
    if size:
        parts.append(f"Taille : {size['effectif_min']} à {size['effectif_max']} salariés")
    text = " ; ".join(parts) or "Entreprises à préciser (fiche cible incomplète)."
    return text[:limit].rstrip()


# ------------------------------------------------------------------ validation des champs du joueur


def _bad(problems: list[dict], field: str, message: str) -> None:
    problems.append({"loc": ["body", field], "message": message})


def check_consigne(pub: PubEngine, value: str | None) -> str | None:
    """Consigne facultative (donnée, jamais une instruction système) : nettoyée et bornée par `rules_v2`."""
    if value is None:
        return None
    text = ad_kit.clean_text(value, multiline=True)
    limit = pub.rules_v2.limits.campaign_instruction_max_chars
    if len(text) > limit:
        raise ApiError(ErrorCode.INVALID_REQUEST, details=[{"loc": ["body", "consigne"], "message": f"Trop longue (maximum {limit} caractères)."}])
    return text or None


def _validate(pub: PubEngine, problems: list[dict], *, nom=None, objectif=None, plateforme=None, audience=None, budget=None, consigne=None) -> dict[str, Any]:  # noqa: ANN001
    out: dict[str, Any] = {}
    if nom is not None:
        text = ad_kit.clean_text(nom)
        limit = pub.rules_v2.limits.campaign_name_max_chars
        if not text:
            _bad(problems, "nom", "Le nom est obligatoire.")
        elif len(text) > limit:
            _bad(problems, "nom", f"Trop long (maximum {limit} caractères).")
        out["nom"] = text
    if objectif is not None:
        if objectif not in pub.spec.objectifs:
            _bad(problems, "objectif", "Valeur non reconnue.")
        out["objectif"] = objectif
    if plateforme is not None:
        if plateforme not in pub.spec.platform_ids:
            _bad(problems, "plateforme", "Valeur non reconnue.")
        out["plateforme"] = plateforme
    if audience is not None:
        text = ad_kit.clean_text(audience, multiline=True)
        limit = pub.spec.rules.text_bounds["audience_max"]
        if len(text) > limit:
            _bad(problems, "audience", f"Trop longue (maximum {limit} caractères).")
        out["audience"] = text
    if budget is not None:
        text = ad_kit.clean_text(budget)
        limit = pub.spec.rules.budget_max_chars
        if len(text) > limit:
            _bad(problems, "budget_indicatif", f"Trop long (maximum {limit} caractères).")
        out["budget_indicatif"] = text or None
    if consigne is not None:
        try:
            out["consigne"] = check_consigne(pub, consigne)
        except ApiError as exc:
            problems.extend(exc.details or [])
    return out


# ------------------------------------------------------------------ idempotence des mutations


def _replay(db: Session, session_id: str, key: str, req_hash: str) -> CampaignRequest | None:
    row = db.scalar(select(CampaignRequest).where(CampaignRequest.session_id == session_id, CampaignRequest.key_hash == hash_token(key)))
    if row is not None and row.request_hash != req_hash:
        raise ApiError(ErrorCode.INVALID_REQUEST, REUSED_KEY)
    return row


def _record(db: Session, session_id: str, key: str, req_hash: str, status: int, response: dict | None) -> None:
    db.add(CampaignRequest(session_id=session_id, key_hash=hash_token(key), request_hash=req_hash, status_code=status, response=response))


# ------------------------------------------------------------------ lecture


def get_campaign(db: Session, session_id: str, campaign_id: str) -> Campaign:
    row = db.get(Campaign, campaign_id)
    if row is None or row.session_id != session_id:
        raise ApiError(ErrorCode.NOT_FOUND)
    return row


def generations_remaining(db: Session, pub: PubEngine, session_id: str, campaign_id: str) -> int:
    rule = pub.rules_v2.prospect_actions[ACTION]
    row = db.scalar(
        select(TargetActionUse).where(
            TargetActionUse.session_id == session_id, TargetActionUse.kind == rule.target,
            TargetActionUse.target_id == campaign_id, TargetActionUse.key == rule.role.value,
        )
    )
    used = (row.used + row.reserved) if row else 0
    return max(0, rule.quota_per_target - used)


def version_out(row: CampaignVersion) -> CampaignVersionOut:
    return CampaignVersionOut(
        id=row.id, numero=row.numero, parent_id=row.parent_id, auteur=row.auteur, kit=AdKitOut.model_validate(row.kit),
        controles=[CheckResultOut.model_validate(c) for c in row.checks], consigne=row.consigne, profile_version=row.profile_version,
        simule=row.simule, action_id=row.action_id, cree_le=aware(row.created_at),
    )


def _versions(db: Session, campaign_id: str) -> list[CampaignVersion]:
    return list(db.scalars(select(CampaignVersion).where(CampaignVersion.campaign_id == campaign_id).order_by(CampaignVersion.numero)))


def campaign_out(db: Session, pub: PubEngine, row: Campaign) -> CampaignOut:
    return CampaignOut(
        id=row.id, nom=row.nom, objectif=row.objectif, plateforme=row.plateforme, audience=row.audience,
        budget_indicatif=row.budget_indicatif, consigne=row.consigne, version=row.version,
        versions=[version_out(v) for v in _versions(db, row.id)],
        generations_remaining=generations_remaining(db, pub, row.session_id, row.id),
        generation_cost=pub.rules_v2.prospect_actions[ACTION].cost,
        cree_le=aware(row.created_at), modifie_le=aware(row.updated_at),
    )


def read_campaign(pub: PubEngine, session_id: str, campaign_id: str) -> CampaignOut:
    with pub.sf() as db:
        return campaign_out(db, pub, get_campaign(db, session_id, campaign_id))


def list_campaigns(pub: PubEngine, session_id: str) -> CampaignListOut:
    with pub.sf() as db:
        rows = list(db.scalars(select(Campaign).where(Campaign.session_id == session_id).order_by(Campaign.updated_at.desc(), Campaign.id)))
        counts: dict[str, tuple[int, int]] = {}
        if rows:
            for cid, n, last in db.execute(
                select(CampaignVersion.campaign_id, func.count(), func.max(CampaignVersion.numero))
                .where(CampaignVersion.campaign_id.in_([r.id for r in rows]))
                .group_by(CampaignVersion.campaign_id)
            ):
                counts[cid] = (n, last)
        items = [
            CampaignSummaryOut(
                id=r.id, nom=r.nom, objectif=r.objectif, plateforme=r.plateforme, version=r.version,
                versions_count=counts.get(r.id, (0, None))[0], derniere_version=counts.get(r.id, (0, None))[1],
                generations_remaining=generations_remaining(db, pub, session_id, r.id), modifie_le=aware(r.updated_at),
            )
            for r in rows
        ]
        return CampaignListOut(items=items, total=len(items), max=pub.rules_v2.limits.campaigns_max, generation_cost=pub.rules_v2.prospect_actions[ACTION].cost)


# ------------------------------------------------------------------ mutations


def create_campaign(pub: PubEngine, session_id: str, key: str, payload: CampaignIn) -> tuple[CampaignOut, bool]:
    """Retourne (campagne, rejeu?). Limite `limits.campaigns_max` par partie (INVALID_STATE au-delà)."""
    req_hash = request_hash({"op": "campaign_create", **payload.model_dump()})
    with pub.sf() as db:
        ledger.begin_immediate(db)
        replay = _replay(db, session_id, key, req_hash)
        if replay is not None:
            return CampaignOut.model_validate(replay.response), True
        problems: list[dict] = []
        fields = _validate(
            pub, problems, nom=payload.nom, objectif=payload.objectif, plateforme=payload.plateforme,
            audience=payload.audience, budget=payload.budget_indicatif, consigne=payload.consigne,
        )
        if problems:
            raise ApiError(ErrorCode.INVALID_REQUEST, details=problems)
        count = db.scalar(select(func.count()).select_from(Campaign).where(Campaign.session_id == session_id))
        if count >= pub.rules_v2.limits.campaigns_max:
            raise ApiError(ErrorCode.INVALID_STATE, f"Limite de {pub.rules_v2.limits.campaigns_max} campagnes atteinte : supprimez-en une.")
        if not fields.get("audience"):
            profile, _ = profile_data(db, pub, session_id)
            fields["audience"] = derive_audience(pub, profile)
        row = Campaign(session_id=session_id, version=1, **fields)
        db.add(row)
        db.flush()
        out = campaign_out(db, pub, row)
        _record(db, session_id, key, req_hash, 201, out.model_dump(mode="json"))
        db.commit()
        return out, False


def patch_campaign(pub: PubEngine, session_id: str, key: str, campaign_id: str, payload: CampaignPatch) -> CampaignOut:
    """Le joueur ne modifie que `nom`, `objectif`, `plateforme`, `audience`, `budget_indicatif`, `consigne`."""
    req_hash = request_hash({"op": "campaign_patch", "id": campaign_id, **payload.model_dump(exclude_unset=True)})
    with pub.sf() as db:
        ledger.begin_immediate(db)
        replay = _replay(db, session_id, key, req_hash)
        if replay is not None:
            return CampaignOut.model_validate(replay.response)
        row = get_campaign(db, session_id, campaign_id)
        given = payload.model_dump(exclude_unset=True)
        given.pop("version")
        if not given:
            raise ApiError(ErrorCode.INVALID_REQUEST, "Aucun champ à modifier.")
        for required in ("nom", "objectif", "plateforme"):
            if required in given and given[required] is None:
                raise ApiError(ErrorCode.INVALID_REQUEST, details=[{"loc": ["body", required], "message": "Ne peut pas être effacé."}])
        if payload.version != row.version:
            raise ApiError(ErrorCode.VERSION_CONFLICT, "La campagne a changé depuis votre dernière lecture ; rechargez-la.")
        problems: list[dict] = []
        fields = _validate(
            pub, problems, nom=given.get("nom"), objectif=given.get("objectif"), plateforme=given.get("plateforme"),
            audience=given.get("audience"), budget=given.get("budget_indicatif"), consigne=given.get("consigne"),
        )
        if problems:
            raise ApiError(ErrorCode.INVALID_REQUEST, details=problems)
        if "audience" in given and not fields.get("audience"):  # vide ou null : re-dérivée de la fiche cible
            profile, _ = profile_data(db, pub, session_id)
            fields["audience"] = derive_audience(pub, profile)
        for name in ("budget_indicatif", "consigne"):  # null ou vide : efface
            if name in given and given[name] is None:
                fields[name] = None
        for name, value in fields.items():
            setattr(row, name, value)
        row.version += 1
        row.updated_at = datetime.now(UTC)
        db.flush()
        out = campaign_out(db, pub, row)
        _record(db, session_id, key, req_hash, 200, out.model_dump(mode="json"))
        db.commit()
        return out


def delete_campaign(pub: PubEngine, session_id: str, key: str, campaign_id: str) -> None:
    """Suppression en cascade (versions, compteur de quota) ; rejouable : même clé, même 204. Jamais refusée pour manque de fonds."""
    req_hash = request_hash({"op": "campaign_delete", "id": campaign_id})
    with pub.sf() as db:
        ledger.begin_immediate(db)
        if _replay(db, session_id, key, req_hash) is not None:
            return
        row = get_campaign(db, session_id, campaign_id)
        db.execute(delete(TargetActionUse).where(TargetActionUse.session_id == session_id, TargetActionUse.kind == "campaign", TargetActionUse.target_id == campaign_id))
        db.delete(row)  # versions : ON DELETE CASCADE
        _record(db, session_id, key, req_hash, 204, None)
        db.commit()


def next_numero(db: Session, campaign_id: str) -> int:
    return db.scalar(select(func.coalesce(func.max(CampaignVersion.numero), 0)).where(CampaignVersion.campaign_id == campaign_id)) + 1


def edit_version(pub: PubEngine, session_id: str, key: str, campaign_id: str, version_id: str, payload: VersionEditIn) -> tuple[CampaignVersionOut, bool]:
    """Copie éditée : nouvelle version enfant (auteur `joueur`) ; la version d'origine reste immuable. Le joueur reste
    maître de ses faits : seuls la structure, les limites de caractères, la checklist et l'absence de balise/lien bloquent."""
    req_hash = request_hash({"op": "campaign_edit", "id": campaign_id, "version_id": version_id, **payload.model_dump(mode="json")})
    with pub.sf() as db:
        ledger.begin_immediate(db)
        replay = _replay(db, session_id, key, req_hash)
        if replay is not None:
            return CampaignVersionOut.model_validate(replay.response), True
        campaign = get_campaign(db, session_id, campaign_id)
        parent = db.get(CampaignVersion, version_id)
        if parent is None or parent.campaign_id != campaign.id:
            raise ApiError(ErrorCode.NOT_FOUND)
        if payload.version != campaign.version:
            raise ApiError(ErrorCode.VERSION_CONFLICT, "La campagne a changé depuis votre dernière lecture ; rechargez-la.")
        if next_numero(db, campaign.id) > pub.spec.rules.versions_max:
            raise ApiError(ErrorCode.INVALID_STATE, f"Limite de {pub.spec.rules.versions_max} versions atteinte pour cette campagne.")
        parsed = ad_kit.validate_kit_object(payload.kit.model_dump())
        if parsed.kit is None:
            raise ApiError(ErrorCode.INVALID_REQUEST, details=[{"loc": ["body", "kit"], "message": p} for p in parsed.problems])
        profile, _ = profile_data(db, pub, session_id)
        results = ad_kit.run_checks(
            pub.spec, parsed, platform_id=campaign.plateforme, objectif=campaign.objectif, profile=profile,
            profile_fields=pub.profile_spec.field_names,
        )
        blocking = ad_kit.essential_failures(results, player=True)
        if blocking:
            raise ApiError(
                ErrorCode.INVALID_REQUEST,
                details=[{"loc": ["body", "kit"], "message": f"{r['label']} : {r['detail'] or 'échec'}"} for r in blocking],
            )
        row = CampaignVersion(
            campaign_id=campaign.id, numero=next_numero(db, campaign.id), parent_id=parent.id, auteur="joueur",
            kit=ad_kit.finalize_kit(pub.spec, parsed.kit, campaign.plateforme).model_dump(mode="json"),
            checks=ad_kit.public_checks(results), consigne=None, profile_version=parent.profile_version, simule=parent.simule, action_id=None,
        )
        db.add(row)
        campaign.version += 1
        campaign.updated_at = datetime.now(UTC)
        try:
            db.flush()
        except IntegrityError:  # deux copies concurrentes : l'unicité (campagne, numéro) tranche
            db.rollback()
            raise ApiError(ErrorCode.VERSION_CONFLICT, "La campagne a changé depuis votre dernière lecture ; rechargez-la.") from None
        out = version_out(row)
        _record(db, session_id, key, req_hash, 201, out.model_dump(mode="json"))
        db.commit()
        return out, False


# ------------------------------------------------------------------ export Markdown


_MD_SPECIAL = re.compile(r"([\\`*_\[\]<>|~&#])")


def md_escape(text: str) -> str:
    """Texte du modèle ou du joueur rendu en Markdown **inerte** : ni lien, ni HTML, ni titre, ni liste injectés."""
    return _MD_SPECIAL.sub(r"\\\1", text)


def _quote(text: str) -> str:
    return "\n".join("> " + md_escape(line) for line in (text.split("\n") or [""]))


def build_markdown(pub: PubEngine, campaign: Campaign, version: CampaignVersion) -> str:
    kit = AdKitOut.model_validate(version.kit)
    platform = pub.spec.platform(campaign.plateforme)
    lines: list[str] = [
        f"# {md_escape(campaign.nom)}",
        "",
        f"> **{pub.spec.rules.export['banner']}**",
        "",
        f"- Objectif : {md_escape(campaign.objectif)}",
        f"- Plateforme : {md_escape(platform.label if platform else campaign.plateforme)} (choix des formats seulement, aucune connexion)",
        f"- Audience : {md_escape(campaign.audience)}",
    ]
    if campaign.budget_indicatif:
        lines.append(f"- Budget indicatif (texte de plan, rien n'est dépensé) : {md_escape(campaign.budget_indicatif)}")
    lines += [
        f"- Version du kit : {version.numero} ({'rédigée par vous' if version.auteur == 'joueur' else 'agent directeur de campagne'})",
        f"- Généré le : {aware(version.created_at).strftime('%Y-%m-%d %H:%M')} UTC",
    ]
    if version.simule:
        lines.append("- **Contenu simulé** (Tutoriel ou fournisseur simulé) : exemple d'apprentissage.")
    lines += ["", "## Positionnement", "", _quote(kit.positionnement), "", "## Résumé de l'audience", "", _quote(kit.audience_resume), "", "## Accroches", ""]
    for i, a in enumerate(kit.accroches, 1):
        lines += [f"{i}. {md_escape(a.texte)} (lié à : {md_escape(a.fiche)})"]
    lines += ["", "## Textes par format", ""]
    for t in kit.textes:
        fmt = next((f for f in (platform.formats if platform else []) if f.id == t.format), None)
        lines += [f"### {md_escape(fmt.label if fmt else t.format)}", ""]
        for fid, values in t.champs.items():
            field = next((f for f in (fmt.fields if fmt else []) if f.id == fid), None)
            label = field.label if field else fid
            for v in values:
                limit = f"/{field.max_chars}" if field else ""
                lines += [f"**{md_escape(label)}** ({len(v)}{limit} caractères)", "", _quote(v), ""]
    b = kit.brief_visuel
    lines += [
        "## Brief visuel (aucune image n'est générée)", "",
        f"- Sujet : {md_escape(b.sujet)}", f"- Style : {md_escape(b.style)}", f"- Texte à l'image : {md_escape(b.texte_image)}",
        f"- Format et dimensions : {md_escape(b.format_dimensions)}", "", "Prompt prêt à coller dans un outil d'image :", "", _quote(b.prompt), "",
        "## Plan indicatif", "", "### Calendrier", "",
    ]
    lines += [f"- {md_escape(x)}" for x in kit.plan.calendrier] + ["", "### Répartition du budget indicatif", ""]
    lines += [f"- {md_escape(x)}" for x in kit.plan.repartition_budget] + ["", "### Indicateurs de suivi (sans valeur promise)", ""]
    lines += [f"- {md_escape(x)}" for x in kit.plan.indicateurs] + ["", "## Checklist avant de publier vous-même", ""]
    lines += [f"- [ ] {md_escape(c.label)}{' (essentiel)' if c.essential else ''}" for c in kit.checklist] + ["", "## À vérifier par vous", ""]
    lines += [f"- {md_escape(x)}" for x in kit.a_verifier] or ["- Rien de signalé."]
    lines += ["", "## Contrôles du serveur", ""]
    for c in version.checks:
        lines.append(f"- {'OK' if c['passed'] else 'ÉCHEC'} : {md_escape(c['label'])}" + ("" if c["passed"] or not c.get("detail") else f" ({md_escape(c['detail'])})"))
    return "\n".join(lines) + "\n"


def export_markdown(pub: PubEngine, session_id: str, campaign_id: str, version_ref: str | None) -> tuple[str, str]:
    """(nom de fichier, contenu) du kit d'une version (dernière par défaut ; `version_ref` = numéro ou id). Gratuit."""
    with pub.sf() as db:
        campaign = get_campaign(db, session_id, campaign_id)
        versions = _versions(db, campaign.id)
        if version_ref is None:
            chosen = versions[-1] if versions else None
        elif version_ref.isdigit():
            chosen = next((v for v in versions if v.numero == int(version_ref)), None)
        else:
            chosen = next((v for v in versions if v.id == version_ref), None)
        if chosen is None:
            raise ApiError(ErrorCode.NOT_FOUND)
        return f"campagne-{campaign.id}-v{chosen.numero}.md", build_markdown(pub, campaign, chosen)
