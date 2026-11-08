"""Export CSV du carnet (API-I4), produit **par le serveur** (docs/PRODUIT-PROSPECTION.md §12).

UTF-8 avec BOM, séparateur `;`, fin de ligne CRLF, RFC 4180, en-têtes français. **Neutralisation des formules à un seul
endroit** (`neutralize`) : toute cellule texte dont le premier caractère est `=`, `+`, `-`, `@`, tabulation ou retour chariot
reçoit le préfixe `'`, dans TOUTES les colonnes texte (le contenu des prospects vient de plateformes et de modèles : non fiable)."""

from __future__ import annotations

from datetime import UTC, datetime

from ..models import Prospect

BOM = "﻿"
SEP = ";"
EOL = "\r\n"
DANGEROUS = ("=", "+", "-", "@", "\t", "\r")
HEADERS = (
    "id", "entreprise", "contact", "fonction", "canal_type", "canal", "raison_de_correspondance", "pertinence", "fiabilite",
    "origine", "simule", "statut", "notes", "ajoute_le", "contacte_le", "source_ref", "etiquette_pertinence", "citation_pertinence",
)


def neutralize(value: str) -> str:
    return "'" + value if value.startswith(DANGEROUS) else value


def quote(value: str) -> str:
    """RFC 4180 : guillemets autour d'un champ contenant `;`, `"` ou un saut de ligne ; guillemets internes doublés."""
    if any(c in value for c in (SEP, '"', "\r", "\n")):
        return '"' + value.replace('"', '""') + '"'
    return value


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return ""
    dt = dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _row(p: Prospect) -> list[tuple[str, bool]]:
    """(valeur, est_texte) dans l'ordre de `HEADERS`. Seule `pertinence` (entier serveur) n'est pas du texte."""
    raison = " | ".join(p.raisons_fit or []) or (p.signal or "")
    return [
        (p.id, True), (p.entreprise, True), (p.contact_nom or "", True), (p.contact_fonction or "", True),
        (p.canal_type or "", True), (p.canal_valeur or "", True), (raison, True), (str(int(p.pertinence)), False),
        (p.fiabilite, True), (p.source, True), ("oui" if p.simule else "non", True), (p.statut, True), (p.notes or "", True),
        (_iso(p.cree_le), True), (_iso(p.contacte_le), True), (p.source_ref, True),
        (p.pertinence_etiquette or "a_verifier", True), (p.pertinence_citation or "", True),
    ]


def render(rows: list[Prospect]) -> bytes:
    lines = [SEP.join(HEADERS)]
    for p in rows:
        lines.append(SEP.join(quote(neutralize(v) if is_text else v) for v, is_text in _row(p)))
    return (BOM + EOL.join(lines) + EOL).encode("utf-8")


def filename(simulated: bool, now: datetime | None = None) -> str:
    day = (now or datetime.now(UTC)).strftime("%Y%m%d")
    return f"prospects-SIMULE-{day}.csv" if simulated else f"prospects-{day}.csv"
