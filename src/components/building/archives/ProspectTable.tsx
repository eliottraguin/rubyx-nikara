import { DEFAULT_ORDER, fiabiliteLabel, statutLabel, type Prospect, type ProspectOrdre, type ProspectTri } from "@/lib/api/prospects";

const COLS: { tri: ProspectTri; label: string }[] = [
  { tri: "entreprise", label: "Entreprise" },
  { tri: "statut", label: "Statut" },
  { tri: "pertinence", label: "Pertinence" },
  { tri: "fiabilite", label: "Fiabilité" },
  { tri: "source", label: "Source" },
  { tri: "date_ajout", label: "Ajouté le" },
];

export const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
};

export function nextOrder(tri: ProspectTri, current: ProspectTri, ordre: ProspectOrdre): ProspectOrdre {
  return tri === current ? (ordre === "asc" ? "desc" : "asc") : DEFAULT_ORDER[tri];
}

export function ProspectTable({
  items,
  tri,
  ordre,
  selectedId,
  onSort,
  onSelect,
}: {
  items: Prospect[];
  tri: ProspectTri;
  ordre: ProspectOrdre;
  selectedId: string | null;
  onSort: (tri: ProspectTri) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table aria-label="Prospects du carnet" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.tri} scope="col" aria-sort={c.tri === tri ? (ordre === "asc" ? "ascending" : "descending") : "none"} style={{ textAlign: "left", padding: ".3rem .5rem" }}>
                <button type="button" className="btn btn-small" onClick={() => onSort(c.tri)}>
                  {c.label}
                  {c.tri === tri ? (ordre === "asc" ? " ▲" : " ▼") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} aria-selected={p.id === selectedId} style={p.id === selectedId ? { background: "var(--accent-soft)" } : undefined}>
              <th scope="row" style={{ textAlign: "left", padding: ".3rem .5rem" }}>
                <button type="button" className="btn btn-small" aria-pressed={p.id === selectedId} aria-label={`Ouvrir la fiche : ${p.entreprise}`} onClick={() => onSelect(p.id)}>
                  {p.entreprise}
                </button>
                {p.possible_doublon ? <span className="help"> (doublon possible)</span> : null}
              </th>
              <td style={{ padding: ".3rem .5rem" }}>{statutLabel(p.statut)}</td>
              <td style={{ padding: ".3rem .5rem" }}>{p.pertinence} / 100</td>
              <td style={{ padding: ".3rem .5rem" }}>{fiabiliteLabel(p.fiabilite)}</td>
              <td style={{ padding: ".3rem .5rem" }}>{p.source}</td>
              <td style={{ padding: ".3rem .5rem" }}>{fmtDate(p.cree_le)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
