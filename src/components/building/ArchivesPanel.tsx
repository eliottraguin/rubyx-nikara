"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PERTINENCES } from "@/lib/api/searches";
import { ApiError, type GameState } from "@/lib/api/types";
import { PLANETS } from "@/game/map/planets";
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
import { ProspectTable, COLS, nextOrder } from "./archives/ProspectTable";
import { ProspectCard } from "./archives/ProspectCard";
import { useFavoris } from "./archives/useFavoris";
import s from "./archives/archives.module.css";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Une erreur est survenue.");

type Vue = "cartes" | "liste";
const VUE_KEY = "rubix.carnet.vue";
const lireVue = (): Vue => {
  try {
    return window.localStorage.getItem(VUE_KEY) === "liste" ? "liste" : "cartes";
  } catch {
    return "cartes";
  }
};
const ecrireVue = (v: Vue) => {
  try {
    window.localStorage.setItem(VUE_KEY, v);
  } catch {
    /* stockage indisponible : réglage gardé en mémoire seulement */
  }
};

/**
 * Archives : carnet de prospection (`/api/prospects`). Consulter, trier, filtrer, annoter, supprimer et exporter ne dépendent jamais de l'argent.
 * Props : `state` (inutilisé, conservé pour BuildingView) ; `client` (injectable pour les tests, défaut : client HTTP).
 */
export function ArchivesPanel({ state, client }: { state?: GameState; client?: ProspectsClient }) {
  void state;
  const api = useMemo(() => client ?? createProspectsClient(), [client]);
  const favoris = useFavoris();
  const [vue, setVue] = useState<Vue>(() => lireVue());
  const [tri, setTri] = useState<ProspectTri>("date_ajout");
  const [ordre, setOrdre] = useState<ProspectOrdre>("desc");
  const [statut, setStatut] = useState("");
  const [etiquette, setEtiquette] = useState<Pertinence | "">("");
  const [source, setSource] = useState("");
  const [favorisOnly, setFavorisOnly] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Prospect[]>([]);
  const [meta, setMeta] = useState<Pick<ProspectList, "counts" | "total" | "next_cursor"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProspectDetail | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [arrivedIds, setArrivedIds] = useState<string[]>([]);
  const [bump, setBump] = useState(false);
  const [contactingId, setContactingId] = useState<string | null>(null);
  const seq = useRef(0);
  const knownIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const query: ProspectQuery = useMemo(
    () => ({ tri, ordre, statut: statut || undefined, etiquette: etiquette || undefined, source: source || undefined, q: q || undefined }),
    [tri, ordre, statut, etiquette, source, q],
  );

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
        if (!append) {
          const fresh = r.items.map((x) => x.id).filter((id) => !knownIds.current.has(id));
          if (!firstLoad.current && fresh.length) {
            setArrivedIds(fresh);
            setBump(true);
          }
          firstLoad.current = false;
          for (const it of r.items) knownIds.current.add(it.id);
        }
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

  useEffect(() => {
    if (!bump) return;
    const t = setTimeout(() => {
      setBump(false);
      setArrivedIds([]);
    }, 1200);
    return () => clearTimeout(t);
  }, [bump]);

  function changeVue(v: Vue) {
    setVue(v);
    ecrireVue(v);
  }

  async function open(id: string) {
    setError(null);
    try {
      setSelected(await api.get(id));
    } catch (e) {
      setError(msg(e));
    }
  }

  async function contacter(id: string) {
    setContactingId(id);
    setError(null);
    try {
      const p = items.find((x) => x.id === id);
      if (!p) return;
      const next = await api.patch(id, { version: p.version, statut: "contacte" });
      setItems((prev) => prev.map((x) => (x.id === id ? next : x)));
      if (selected?.id === id) setSelected({ ...selected, ...next });
    } catch (e) {
      setError(msg(e));
    } finally {
      setContactingId(null);
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

  const displayed = favorisOnly ? items.filter((p) => favoris.isFavori(p.id)) : items;
  const filtered = Boolean(statut || etiquette || source || q || favorisOnly);
  const total = meta?.total ?? 0;
  const empty = !loading && !error && displayed.length === 0;

  return (
    <section className="card" aria-labelledby="archives-title">
      <h2 className="h3" id="archives-title">
        Archives
      </h2>
      <p className="note note-info" role="note">
        Rien n&apos;a été envoyé. Marquer un prospect « contacté » est une déclaration de votre part.
      </p>

      <div className={s.toolbar}>
        <p className={s.counter} aria-live="polite">
          <span aria-hidden="true">🗂️</span>{" "}
          <span className={bump ? s.counterBump : undefined}>{total} prospect{total === 1 ? "" : "s"}</span>
        </p>
        <div className={s.viewToggle} role="group" aria-label="Mode d'affichage">
          <button type="button" aria-pressed={vue === "cartes"} onClick={() => changeVue("cartes")}>
            Cartes
          </button>
          <button type="button" aria-pressed={vue === "liste"} onClick={() => changeVue("liste")}>
            Liste compacte
          </button>
        </div>
      </div>

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

      <div className={s.chips} role="group" aria-label="Filtrer par statut">
        <button type="button" className={s.chip} aria-pressed={statut === ""} onClick={() => setStatut("")}>
          Tous{meta ? ` (${meta.total})` : ""}
        </button>
        {STATUTS.map((st) => (
          <button key={st} type="button" className={s.chip} aria-pressed={statut === st} onClick={() => setStatut(st)}>
            {statutLabel(st)}
            {meta ? ` (${meta.counts[st] ?? 0})` : ""}
          </button>
        ))}
      </div>

      <div className={s.chips} role="group" aria-label="Filtrer par correspondance">
        <button type="button" className={s.chip} aria-pressed={etiquette === ""} onClick={() => setEtiquette("")}>
          Toutes les correspondances
        </button>
        {PERTINENCES.map((e) => (
          <button key={e} type="button" className={s.chip} aria-pressed={etiquette === e} onClick={() => setEtiquette(e)}>
            <span aria-hidden="true">{PERTINENCE[e].mark}</span> {PERTINENCE[e].label}
          </button>
        ))}
      </div>

      <div className={s.chips} role="group" aria-label="Filtrer par lieu">
        <button type="button" className={s.chip} aria-pressed={source === ""} onClick={() => setSource("")}>
          Tous les lieux
        </button>
        {PLANETS.map((p) => (
          <button key={p.id} type="button" className={s.chip} aria-pressed={source === p.id} onClick={() => setSource(p.id)}>
            {p.name}
          </button>
        ))}
        <button type="button" className={s.chip} aria-pressed={favorisOnly} onClick={() => setFavorisOnly((v) => !v)}>
          <span aria-hidden="true">★</span> Favoris
        </button>
      </div>

      {vue === "cartes" ? (
        <div className="row">
          <label htmlFor="archives-tri" className="help">
            Trier par
          </label>
          <select
            id="archives-tri"
            value={tri}
            onChange={(e) => {
              const t = e.target.value as ProspectTri;
              setOrdre(nextOrder(t, tri, ordre));
              setTri(t);
            }}
          >
            {COLS.map((c) => (
              <option key={c.tri} value={c.tri}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-small" onClick={() => setOrdre((o) => (o === "asc" ? "desc" : "asc"))} aria-label={`Ordre ${ordre === "asc" ? "croissant" : "décroissant"}, cliquer pour inverser`}>
            {ordre === "asc" ? "▲ Croissant" : "▼ Décroissant"}
          </button>
        </div>
      ) : null}

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
        <div className={s.emptyState}>
          <span className={s.emptyIcon} aria-hidden="true">
            🔭
          </span>
          <p className="help">
            {filtered ? "Aucun prospect ne correspond à ces filtres." : "Envoyez un agent chercher vos premiers clients."}
          </p>
          {!filtered && total === 0 ? (
            <p>
              <Link className="btn btn-small btn-primary" href="/carte">
                Lancer une recherche
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={`${s.layout} ${selected ? s.hasSide : ""}`}>
        <div>
          {displayed.length > 0 ? (
            vue === "liste" ? (
              <ProspectTable
                items={displayed}
                tri={tri}
                ordre={ordre}
                selectedId={selected?.id ?? null}
                onSort={(t) => {
                  setOrdre(nextOrder(t, tri, ordre));
                  setTri(t);
                }}
                onSelect={(id) => void open(id)}
              />
            ) : (
              <ul className={s.grid}>
                {displayed.map((p) => (
                  <ProspectCard
                    key={p.id}
                    prospect={p}
                    selected={selected?.id === p.id}
                    favori={favoris.isFavori(p.id)}
                    contacting={contactingId === p.id}
                    isNew={arrivedIds.includes(p.id)}
                    onOpen={(id) => void open(id)}
                    onToggleFavori={favoris.toggle}
                    onContacter={(id) => void contacter(id)}
                  />
                ))}
              </ul>
            )
          ) : null}
          {meta?.next_cursor ? (
            <p>
              <button type="button" className="btn btn-small" disabled={loading} onClick={() => void load(true, meta.next_cursor ?? undefined)}>
                Charger la suite
              </button>
            </p>
          ) : null}
        </div>

        {selected ? (
          <div className={s.side}>
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
