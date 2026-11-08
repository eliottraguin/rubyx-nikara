"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PERTINENCES } from "@/lib/api/searches";
import { ApiError, type GameState } from "@/lib/api/types";
import {
  STATUTS,
  createProspectsClient,
  exportUrl,
  statutLabel,
  type ProspectDetail,
  type ProspectList,
  type ProspectOrdre,
  type ProspectQuery,
  type ProspectsClient,
  type ProspectTri,
  type Pertinence,
  type Prospect,
} from "@/lib/api/prospects";
import { PERTINENCE } from "@/content/recherche";
import { ProspectDetailView } from "./archives/ProspectDetailView";
import { ProspectTable, nextOrder } from "./archives/ProspectTable";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Une erreur est survenue.");

/**
 * Archives : carnet de prospection (`/api/prospects`). Consulter, trier, filtrer, annoter, supprimer et exporter ne dépendent jamais de l'argent.
 * Props : `state` (inutilisé, conservé pour BuildingView) ; `client` (injectable pour les tests, défaut : client HTTP).
 */
export function ArchivesPanel({ state, client }: { state?: GameState; client?: ProspectsClient }) {
  void state;
  const api = useMemo(() => client ?? createProspectsClient(), [client]);
  const [tri, setTri] = useState<ProspectTri>("date_ajout");
  const [ordre, setOrdre] = useState<ProspectOrdre>("desc");
  const [statut, setStatut] = useState("");
  const [etiquette, setEtiquette] = useState<Pertinence | "">("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Prospect[]>([]);
  const [meta, setMeta] = useState<Pick<ProspectList, "counts" | "total" | "next_cursor"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProspectDetail | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const seq = useRef(0);

  const query: ProspectQuery = useMemo(() => ({ tri, ordre, statut: statut || undefined, etiquette: etiquette || undefined, q: q || undefined }), [tri, ordre, statut, etiquette, q]);

  const load = useCallback(
    async (append: boolean, cursor?: string) => {
      const n = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const r = await api.list({ ...query, cursor, limit: 50 });
        if (n !== seq.current) return;
        setItems((prev) => (append ? [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))] : r.items));
        setMeta({ counts: r.counts, total: r.total, next_cursor: r.next_cursor });
      } catch (e) {
        if (n === seq.current) setError(msg(e));
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    [api, query],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement serveur au montage et à chaque changement de tri ou de filtre
    void load(false);
  }, [load]);

  async function open(id: string) {
    setError(null);
    try {
      setSelected(await api.get(id));
    } catch (e) {
      setError(msg(e));
    }
  }

  async function purge() {
    setError(null);
    try {
      await api.purge();
      setConfirmPurge(false);
      setSelected(null);
      setInfo("Le carnet a été vidé.");
      await load(false);
    } catch (e) {
      setError(msg(e));
    }
  }

  const filtered = Boolean(statut || etiquette || q);
  const total = meta?.total ?? 0;
  const empty = !loading && !error && items.length === 0;

  return (
    <section className="card" aria-labelledby="archives-title">
      <h2 className="h3" id="archives-title">
        Archives
      </h2>
      <p className="note note-info" role="note">
        Rien n&apos;a été envoyé. Marquer un prospect « contacté » est une déclaration de votre part.
      </p>

      <form
        className="row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(qInput.trim());
        }}
      >
        <label htmlFor="archives-q" className="sr-only">
          Rechercher dans le carnet
        </label>
        <input id="archives-q" type="text" maxLength={100} placeholder="Rechercher (entreprise, contact, notes)" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <button type="submit" className="btn btn-small">
          Rechercher
        </button>
      </form>

      <div className="row" role="group" aria-label="Filtrer par statut">
        <button type="button" className="btn btn-small" aria-pressed={statut === ""} onClick={() => setStatut("")}>
          Tous{meta ? ` (${meta.total})` : ""}
        </button>
        {STATUTS.map((s) => (
          <button key={s} type="button" className="btn btn-small" aria-pressed={statut === s} onClick={() => setStatut(s)}>
            {statutLabel(s)}
            {meta ? ` (${meta.counts[s] ?? 0})` : ""}
          </button>
        ))}
      </div>

      <div className="row" role="group" aria-label="Filtrer par correspondance">
        <button type="button" className="btn btn-small" aria-pressed={etiquette === ""} onClick={() => setEtiquette("")}>
          Toutes les correspondances
        </button>
        {PERTINENCES.map((e) => (
          <button key={e} type="button" className="btn btn-small" aria-pressed={etiquette === e} onClick={() => setEtiquette(e)}>
            {PERTINENCE[e].label}
          </button>
        ))}
      </div>

      <div className="row">
        <a className="btn btn-small" href={exportUrl(query)}>
          Exporter en CSV
        </a>
        <span className="help">Le fichier est produit par le serveur (filtres et tri actuels) ; gratuit.</span>
        {total > 0 && !confirmPurge ? (
          <button type="button" className="btn btn-small" onClick={() => setConfirmPurge(true)}>
            Vider le carnet
          </button>
        ) : null}
      </div>

      {confirmPurge ? (
        <div className="note note-warn" role="alertdialog" aria-label="Confirmer le vidage du carnet">
          <p>Supprimer définitivement les {total} prospects du carnet ? Cette action est irréversible. Pensez à exporter d&apos;abord.</p>
          <div className="row">
            <button type="button" className="btn btn-small btn-primary" onClick={() => void purge()}>
              Oui, vider le carnet
            </button>
            <button type="button" className="btn btn-small" onClick={() => setConfirmPurge(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <div aria-live="polite">
        {info ? <p className="note note-ok">{info}</p> : null}
        {loading ? <p className="help">Chargement du carnet…</p> : null}
      </div>
      {error ? (
        <p className="note note-bad" role="alert">
          {error}{" "}
          <button type="button" className="btn btn-small" onClick={() => void load(false)}>
            Réessayer
          </button>
        </p>
      ) : null}

      {empty ? (
        <p className="help">
          {filtered
            ? "Aucun prospect ne correspond à ces filtres."
            : total === 0
              ? "Aucun prospect dans le carnet pour le moment. Lancez une recherche depuis la carte."
              : "Aucun prospect à afficher."}
        </p>
      ) : null}

      {items.length > 0 ? (
        <ProspectTable
          items={items}
          tri={tri}
          ordre={ordre}
          selectedId={selected?.id ?? null}
          onSort={(t) => {
            setOrdre(nextOrder(t, tri, ordre));
            setTri(t);
          }}
          onSelect={(id) => void open(id)}
        />
      ) : null}
      {meta?.next_cursor ? (
        <p>
          <button type="button" className="btn btn-small" disabled={loading} onClick={() => void load(true, meta.next_cursor ?? undefined)}>
            Charger la suite
          </button>
        </p>
      ) : null}

      {selected ? (
        <ProspectDetailView
          key={selected.id}
          prospect={selected}
          client={api}
          onClose={() => setSelected(null)}
          onChange={(p) => {
            setSelected(p);
            void load(false);
          }}
          onDeleted={(id) => {
            setSelected(null);
            setInfo("Prospect supprimé.");
            setItems((prev) => prev.filter((x) => x.id !== id));
            void load(false);
          }}
        />
      ) : null}
    </section>
  );
}
