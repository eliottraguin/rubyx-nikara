"""RACCORD avec le carnet de prospection (`/api/prospects`) : `SqlProspectLookup` est installé par `create_app`.

La messagerie ne lit jamais la table des prospects directement : elle passe par ce `ProspectLookup`. Tant que le carnet
n'est pas fusionné, l'application installe `NullProspectLookup` (aucun prospect : `POST /api/conversations` répond
`NOT_FOUND`) et les tests injectent `tests/messaging_support.FakeProspects`.

À la fusion : écrire `SqlProspectLookup(ProspectLookup)` au-dessus du modèle `Prospect` du carnet et l'installer dans
`create_app` (`app.state.prospects = SqlProspectLookup()`), puis, à la suppression d'un prospect, appeler
`conversations.delete_for_prospect(db, session_id, prospect_id)` (cascade sur messages, brouillons, synthèses).

Contraintes du contrat :
- `get` ne renvoie un prospect que s'il appartient à `session_id` (sinon `None`, jamais de distinction) ;
- `ProspectRef.canal_value` (adresse ou numéro) n'est destiné **qu'au joueur** : il ne doit jamais entrer dans un
  contexte de modèle (la messagerie le masque et le contrôle par code) ;
- `ProspectRef.instantane` est l'instantané **déjà minimisé** (liste blanche de champs) ; les notes du joueur n'y sont pas ;
- `set_status` écrit dans la session de base fournie (même transaction que la messagerie), sans commit."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from sqlalchemy.orm import Session

PROSPECT_STATUSES = ("nouveau", "contacte", "en_discussion", "gagne", "perdu", "ecarte")


@dataclass(frozen=True)
class ProspectRef:
    id: str
    entreprise: str
    fonction: str | None = None
    canal_type: str | None = None  # type de canal seulement (ex. `email_generique`) : seul élément transmis au modèle
    canal_value: str | None = None  # adresse ou numéro : JAMAIS transmis au modèle
    source: str | None = None
    collecte_le: str | None = None
    statut: str = "nouveau"
    instantane: dict[str, Any] = field(default_factory=dict)


class ProspectLookup(Protocol):
    def get(self, db: Session, session_id: str, prospect_id: str) -> ProspectRef | None: ...

    def set_status(self, db: Session, session_id: str, prospect_id: str, statut: str) -> None: ...


class NullProspectLookup:
    """Carnet absent : aucun prospect n'existe encore côté API."""

    def get(self, db: Session, session_id: str, prospect_id: str) -> ProspectRef | None:  # noqa: ARG002
        return None

    def set_status(self, db: Session, session_id: str, prospect_id: str, statut: str) -> None:  # noqa: ARG002
        return None


class SqlProspectLookup:
    """Lecture du carnet réel (table `prospects`). La messagerie ne lit jamais cette table autrement."""

    def get(self, db: Session, session_id: str, prospect_id: str) -> ProspectRef | None:
        from sqlalchemy import select

        from ..models import Prospect

        row = db.scalar(select(Prospect).where(Prospect.id == prospect_id, Prospect.session_id == session_id))
        if row is None:
            return None
        return ProspectRef(
            id=row.id, entreprise=row.entreprise, fonction=row.contact_fonction, canal_type=row.canal_type,
            canal_value=row.canal_valeur, source=row.source, collecte_le=row.collecte_le, statut=row.statut,
            instantane=dict(row.instantane or {}),
        )

    def set_status(self, db: Session, session_id: str, prospect_id: str, statut: str) -> None:
        from sqlalchemy import select

        from ..models import Prospect, utcnow

        row = db.scalar(select(Prospect).where(Prospect.id == prospect_id, Prospect.session_id == session_id))
        if row is None or row.statut == statut:
            return
        now = utcnow()
        row.statut = statut
        row.historique = [*(row.historique or []), {"statut": statut, "le": now.isoformat()}]
        row.modifie_le = now
        row.derniere_activite_le = now
        row.version += 1
