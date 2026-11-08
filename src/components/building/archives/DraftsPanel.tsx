"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BANDEAU, INSTRUCTION_MAX, KIND, QUOTA_ESSAIS, T, problemText } from "@/content/brouillons";
import { buildingHref } from "@/game/building/floors";
import { DRAFT_KINDS, DraftsError, createDraftsApiForMode, type DraftEdit, type DraftKind, type DraftsApi, type DraftsState, type DraftVersion } from "@/lib/api/drafts";
import { createSearchesApiForMode, type SearchesApi } from "@/lib/api/searches";
import { CopyButton } from "../pub/CopyButton";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const codeOf = (e: unknown) => (e instanceof DraftsError ? e.code : "UNKNOWN");
const fmt = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

/** Texte à copier : texte seul, sans mise en forme. */
export function copyText(v: DraftVersion): string {
  if (v.kind === "message") return [v.objet ? `Objet : ${v.objet}` : "", v.corps].filter(Boolean).join("\n\n");
  const part = (title: string, items: string[]) => (items.length ? `${title}\n${items.map((x) => `- ${x}`).join("\n")}` : "");
  return [v.resume, part(T.pourquoi, v.pourquoi), part(T.accroches, v.accroches), part(T.aVerifier, v.aVerifier)].filter(Boolean).join("\n\n");
}

function Problem({ code }: { code: string }) {
  return (
    <p className="note note-warn" role="alert">
      {problemText(code)}
      {code === "ROLE_LOCKED" ? (
        <>
          {" "}
          <Link href={buildingHref("accueil")}>{T.lienAccueil}</Link>
        </>
      ) : null}
    </p>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <h6 className="h3">{title}</h6>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </>
  );
}

function Checks({ v }: { v: DraftVersion }) {
  if (!v.checks.length) return null;
  return (
    <>
      <h6 className="h3">{T.controles}</h6>
      <ul aria-label={T.controles}>
        {v.checks.map((c) => (
          <li key={c.id}>
            <strong>{c.reussi ? T.reussi : T.aCorriger}</strong>
            {" : "}
            {c.label}
            {!c.reussi && c.detail ? ` (${c.detail})` : ""}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Contenu d'une version, en TEXTE SEUL (le texte vient du modèle : jamais de HTML). */
function VersionBody({ v }: { v: DraftVersion }) {
  if (v.kind === "message")
    return (
      <>
        <p>
          <strong>{T.objet} :</strong> {v.objet ?? T.sansObjet}
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>{v.corps}</p>
        <List title={T.aVerifier} items={v.aVerifier} />
      </>
    );
  return (
    <>
      <h6 className="h3">{T.resume}</h6>
      <p style={{ whiteSpace: "pre-wrap" }}>{v.resume}</p>
      <List title={T.pourquoi} items={v.pourquoi} />
      <List title={T.accroches} items={v.accroches} />
      <List title={T.aVerifier} items={v.aVerifier} />
    </>
  );
}

function Editor({ v, busy, onSave, onCancel }: { v: DraftVersion; busy: boolean; onSave: (c: DraftEdit) => void; onCancel: () => void }) {
  const [resume, setResume] = useState(v.resume);
  const [accroches, setAccroches] = useState(v.accroches.join("\n"));
  const [verif, setVerif] = useState(v.aVerifier.join("\n"));
  const [objet, setObjet] = useState(v.objet ?? "");
  const [corps, setCorps] = useState(v.corps);
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => first.current?.focus(), []);
  const empty = v.kind === "message" ? !corps.trim() : !resume.trim();
  return (
    <form
      aria-label={T.modifier}
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || empty) return;
        onSave(
          v.kind === "message"
            ? { objet: objet.trim() || null, corps }
            : { resume, accroches: lines(accroches), aVerifier: lines(verif) },
        );
      }}
    >
      {v.kind === "message" ? (
        <>
          <div className="field">
            <label htmlFor={`ed-objet-${v.id}`}>{T.champs.objet}</label>
            <input id={`ed-objet-${v.id}`} ref={first} type="text" maxLength={90} value={objet} onChange={(e) => setObjet(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`ed-corps-${v.id}`}>{T.champs.corps}</label>
            <textarea id={`ed-corps-${v.id}`} rows={8} maxLength={800} value={corps} onChange={(e) => setCorps(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`ed-resume-${v.id}`}>{T.champs.resume}</label>
            <textarea id={`ed-resume-${v.id}`} ref={first} rows={4} maxLength={600} value={resume} onChange={(e) => setResume(e.target.value)} />
          </div>
          {v.pourquoi.length ? (
            <>
              <List title={T.pourquoi} items={v.pourquoi} />
              <p className="help">{T.pourquoiFixe}</p>
            </>
          ) : null}
          <div className="field">
            <label htmlFor={`ed-accroches-${v.id}`}>{T.champs.accroches}</label>
            <textarea id={`ed-accroches-${v.id}`} rows={3} value={accroches} onChange={(e) => setAccroches(e.target.value)} />
            <p className="help">{T.lignes}</p>
          </div>
          <div className="field">
            <label htmlFor={`ed-verif-${v.id}`}>{T.champs.aVerifier}</label>
            <textarea id={`ed-verif-${v.id}`} rows={3} value={verif} onChange={(e) => setVerif(e.target.value)} />
            <p className="help">{T.lignes}</p>
          </div>
        </>
      )}
      <div className="row">
        <button type="submit" className="btn btn-small btn-primary" disabled={busy || empty}>
          {T.enregistrer}
        </button>
        <button type="button" className="btn btn-small" disabled={busy} onClick={onCancel}>
          {T.annuler}
        </button>
      </div>
    </form>
  );
}

type Busy = "generate" | "edit" | "use" | "contact" | null;

function Section({
  kind, prospectId, api, contact, data, onData,
}: {
  kind: DraftKind;
  prospectId: string;
  api: DraftsApi;
  contact: SearchesApi;
  data: DraftsState;
  onData: (d: DraftsState) => void;
}) {
  const k = KIND[kind];
  const list = data[kind];
  const left = data.remaining[kind];
  const [busy, setBusy] = useState<Busy>(null);
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [instruction, setInstruction] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [conv, setConv] = useState<string | null>(null);
  const current = list.find((v) => v.id === picked) ?? list[list.length - 1] ?? null;
  const index = current ? list.indexOf(current) + 1 : 0;
  const headingId = `drafts-${kind}-${prospectId}`;

  async function run(what: Exclude<Busy, null>, doing: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(what);
    setCode(null);
    setStatus(doing);
    try {
      await fn();
    } catch (e) {
      setCode(codeOf(e));
      setStatus("");
    } finally {
      setBusy(null);
    }
  }

  const generate = () =>
    run("generate", k.enCours, async () => {
      const r = await api.generate(prospectId, kind, instruction);
      onData(r.state);
      setPicked(r.createdId);
      setEditing(false);
      setStatus(k.prete);
    });
  const save = (c: DraftEdit) =>
    run("edit", "Enregistrement…", async () => {
      if (!current) return;
      const r = await api.edit(prospectId, kind, current.id, c);
      onData(r.state);
      setPicked(r.createdId);
      setEditing(false);
      setStatus(T.sauvee);
    });
  const chooseAsFirst = () =>
    run("use", "Ouverture de la conversation…", async () => {
      if (!current) return;
      const r = await api.useAsFirstMessage(prospectId, current.id, current.corps);
      setConv(r.conversationId);
      setStatus("La conversation est ouverte. Rien n'est envoyé.");
    });
  const openConv = () =>
    run("contact", "Ouverture de la conversation…", async () => {
      const r = await contact.contact(prospectId);
      setConv(r.conversationId);
      setStatus("La conversation est ouverte. Rien n'est envoyé.");
    });

  return (
    <section aria-labelledby={headingId} className="drafts-kind">
      <h5 className="h3" id={headingId}>
        {k.titre}
      </h5>
      <p className="help">{k.coller}</p>
      <div className="field">
        <label htmlFor={`${headingId}-instr`}>{T.precision}</label>
        <input id={`${headingId}-instr`} type="text" maxLength={INSTRUCTION_MAX} value={instruction} disabled={busy !== null} onChange={(e) => setInstruction(e.target.value)} aria-describedby={`${headingId}-instr-help`} />
        <p className="help" id={`${headingId}-instr-help`}>
          {T.precisionAide(INSTRUCTION_MAX)}
        </p>
      </div>
      <div className="row">
        <button type="button" className="btn btn-small btn-primary" disabled={busy !== null || left <= 0} aria-busy={busy === "generate"} aria-describedby={`${headingId}-cost`} onClick={() => void generate()}>
          {k.bouton}
        </button>
        <span className="help" id={`${headingId}-cost`}>
          {T.cout(data.costs[kind])} · {T.essais(left)} <span className="muted">({QUOTA_ESSAIS} au total)</span>
        </span>
      </div>
      <p className="help">{T.coutAide}</p>
      <p role="status" aria-live="polite" className="help">
        {status}
      </p>
      {code ? <Problem code={code} /> : null}

      {list.length === 0 ? (
        <p className="muted">{k.vide}</p>
      ) : current ? (
        <div className="card">
          <div className="row">
            <h6 className="h3">
              {T.version(index, list.length)} <span className="muted">· {T.auteur[current.auteur]}{current.createdAt ? `, ${fmt(current.createdAt)}` : ""}</span>
            </h6>
          </div>
          {editing ? (
            <Editor key={current.id} v={current} busy={busy !== null} onSave={(c) => void save(c)} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <VersionBody v={current} />
              <Checks v={current} />
              <div className="row">
                <CopyButton text={copyText(current)} label={T.copier} what={T.copierQuoi[kind]} />
                <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => setEditing(true)}>
                  {T.modifier}
                </button>
                {kind === "message" ? (
                  <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => void chooseAsFirst()} aria-describedby={`${headingId}-use`}>
                    {T.utiliser}
                  </button>
                ) : null}
              </div>
              {kind === "message" ? (
                <p className="help" id={`${headingId}-use`}>
                  {T.utiliserAide}
                </p>
              ) : null}
            </>
          )}
          {list.length > 1 ? (
            <>
              <h6 className="h3">{T.versions}</h6>
              <p className="help">{T.versionsAide}</p>
              <ul className="row" aria-label={T.versions}>
                {list.map((v, i) => (
                  <li key={v.id} style={{ listStyle: "none" }}>
                    <button type="button" className="btn btn-small" aria-pressed={v.id === current.id} disabled={busy !== null} onClick={() => { setPicked(v.id); setEditing(false); }}>
                      {`Version ${i + 1} (${v.auteur === "agent" ? "rédacteur" : "vous"})`}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {kind === "message" ? (
        <div className="row">
          <button type="button" className="btn btn-small" disabled={busy !== null} onClick={() => void openConv()}>
            {T.contacter}
          </button>
          {conv ? <Link href={buildingHref("courrier", { conversation: conv })}>{T.ouvrirConversation}</Link> : null}
        </div>
      ) : null}
    </section>
  );
}

/** Fiche client et premier message d'un prospect : versions immuables, édition en nouvelle version, copie. Rien n'est jamais envoyé. */
export function DraftsPanel({ prospectId, entreprise, api, contact }: { prospectId: string; entreprise: string; api?: DraftsApi; contact?: SearchesApi }) {
  const client = useMemo(() => api ?? createDraftsApiForMode(), [api]);
  const contactApi = useMemo(() => contact ?? createSearchesApiForMode(), [contact]);
  const [data, setData] = useState<DraftsState | null>(null);
  const [loadCode, setLoadCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadCode(null);
    try {
      setData(await client.load(prospectId));
    } catch (e) {
      setLoadCode(codeOf(e));
    }
  }, [client, prospectId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement serveur au montage
    void load();
  }, [load]);

  return (
    <section aria-label={`Fiche client et premier message pour ${entreprise}`} className="drafts">
      <p className="note">{BANDEAU}</p>
      {loadCode ? (
        <>
          <Problem code={loadCode} />
          <button type="button" className="btn btn-small" onClick={() => void load()}>
            Réessayer
          </button>
        </>
      ) : !data ? (
        <p role="status" className="help">
          {T.chargement}
        </p>
      ) : (
        DRAFT_KINDS.map((kind) => <Section key={kind} kind={kind} prospectId={prospectId} api={client} contact={contactApi} data={data} onData={setData} />)
      )}
    </section>
  );
}
