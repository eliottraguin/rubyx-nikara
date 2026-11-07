"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { BriefBlock, CriteriaList, DocumentList } from "@/components/OrderParts";
import { ErrorNote, Notice, Pill, RequireSession, Term } from "@/components/ui";
import type { ActionView, ApiError, ArtifactVersionView, AttemptView, DemoEventId, GameState, RoleId } from "@/lib/api";
import { ROLE_LABEL, money } from "@/lib/format";
import { useGame } from "@/lib/game-context";
import { SafeMarkdown } from "@/lib/markdown";
import { DEFAULT_PROMPT_MAX_CHARS, checkSend } from "@/lib/send-rules";

type Tab = "mission" | "agent" | "deliverable";
const TABS: { id: Tab; label: string }[] = [
  { id: "mission", label: "Brief" },
  { id: "agent", label: "Agent" },
  { id: "deliverable", label: "Livrable" },
];

const NARROW = "(max-width: 899px)";
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(NARROW);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

function readFlag(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function StatusBar({ state, a, role }: { state: GameState; a: AttemptView; role: RoleId | null }) {
  const q = a.roles.find((r) => r.role === role);
  return (
    <div className="statusbar" role="group" aria-label="État de l'expédition">
      <p>
        Solde disponible <strong>{money(state.balance.available)}</strong>
      </p>
      <p>
        Messages {role ? ROLE_LABEL[role] : "de l'agent"}{" "}
        <strong>{q ? `${q.used}/${q.limit}` : `–/${a.roles[0]?.limit ?? "…"}`}</strong>
        <span className="sr-only"> messages utilisés</span>
      </p>
      <p>
        Coût max du prochain envoi{" "}
        <strong>{q ? (q.free_credit ? "0 $ (message gratuit)" : money(q.next_cost_max)) : "–"}</strong>
      </p>
      <p>
        Brief version <strong>{a.brief.version}</strong>
      </p>
    </div>
  );
}

function Tutorial({ a, role, inspected, onInspect }: { a: AttemptView; role: RoleId | null; inspected: boolean; onInspect: () => void }) {
  const read = readFlag(`tuto-read-${a.id}`) === "1" || a.messages.length > 0;
  const sent = a.messages.some((m) => m.author === "player");
  const replied = a.messages.some((m) => m.author === "agent");
  let step: 1 | 2 | 3 | 4 | 5 = 5;
  if (!read) step = 1;
  else if (!role && !sent) step = 2;
  else if (!sent) step = 3;
  else if (replied && !inspected) step = 4;
  if (step === 5)
    return (
      <Notice tone="ok" title="Tutoriel terminé.">
        Vous pouvez modifier le livrable, redemander une version (dans la limite de messages de l&apos;agent) ou le livrer.
      </Notice>
    );
  const texts: Record<number, string> = {
    1: "Lisez le client : relisez le brief du client avant d'agir.",
    2: "Choisissez l'agent : cliquez sur le rédacteur dans la colonne « Agent ».",
    3: "Formulez votre consigne : dites quoi écrire, pour qui, et avec quelles informations (cochez les documents utiles).",
    4: "Inspectez le résultat : comparez le livrable aux critères du client. Manque-t-il une information ?",
  };
  return (
    <div className="note note-info" role="status" aria-live="polite">
      <strong>Étape {step} sur 4. </strong>
      {texts[step]}{" "}
      {step === 1 ? <Link href={`/commande/${a.id}`}>Relire le brief</Link> : null}
      {step === 4 ? (
        <button type="button" className="btn btn-small" onClick={onInspect}>
          J&apos;ai inspecté le livrable
        </button>
      ) : null}
    </div>
  );
}

function ActionBanner({ action, attemptId }: { action: ActionView; attemptId: string }) {
  if (action.attempt_id !== attemptId) return null;
  if (action.status === "AWAITING_CONFIRMATION")
    return (
      <Notice tone="warn" title="Plan du chef à valider.">
        <Link href={`/plan/${action.id}`}>Voir le plan et confirmer ou refuser</Link>
      </Notice>
    );
  return (
    <div className="note note-info" role="status" aria-live="polite">
      <strong>Action en cours : {ROLE_LABEL[action.role]}. </strong>
      {action.progress_label ?? "Traitement…"} {action.reserved > 0 ? `Coût réservé : ${money(action.reserved)}.` : null}
      <span className="muted"> Vous pouvez continuer à lire le brief ou le livrable pendant l&apos;attente.</span>
    </div>
  );
}

function Workshop({ state, attemptId }: { state: GameState; attemptId: string }) {
  const router = useRouter();
  const { api, mutate, busy, live } = useGame();
  const a = state.attempt && state.attempt.id === attemptId ? state.attempt : null;
  const beginner = state.session?.mode === "beginner";
  const narrow = useNarrow();

  const [tab, setTab] = useState<Tab>("agent");
  const [role, setRole] = useState<RoleId | null>(beginner ? null : "scout");
  const [text, setText] = useState(() => {
    const v = readFlag("reuse-prompt");
    if (v) {
      try {
        window.sessionStorage.removeItem("reuse-prompt");
      } catch {
        /* ignoré */
      }
    }
    return v ?? "";
  });
  const [docIds, setDocIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [picked, setPicked] = useState<{ id: string; count: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<number, string>>({});
  const [inspected, setInspected] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);

  if (!a)
    return (
      <div className="card">
        <h1>Atelier introuvable</h1>
        <p>Cette expédition n&apos;est pas active dans votre partie.</p>
        <Link className="btn btn-primary" href="/bureau">
          Retour au bureau
        </Link>
      </div>
    );

  const quota = a.roles.find((r) => r.role === role);
  const actions = state.actions_in_progress.map((x) => live[x.id] ?? x).filter((x) => x.attempt_id === a.id);
  const pendingForRole = actions.some((x) => x.role === role && x.status !== "AWAITING_CONFIRMATION");
  const check = checkSend({ attempt: a, quota, role, balance: state.balance, text, maxChars: state.limits?.prompt_max_chars ?? DEFAULT_PROMPT_MAX_CHARS });
  const reasons = pendingForRole ? [...check.reasons, "Une réponse de cet agent est déjà en cours."] : check.reasons;
  const canSend = check.allowed && !pendingForRole;
  const typingDisabled = !quota || !quota.owned || quota.used >= quota.limit || a.status !== "ACTIVE";
  const limitReached = !!quota && quota.owned && quota.used >= quota.limit;

  const latest = a.artifacts[a.artifacts.length - 1];
  const selected: ArtifactVersionView | undefined =
    (picked && picked.count === a.artifacts.length ? a.artifacts.find((x) => x.id === picked.id) : undefined) ?? latest;
  const cost = quota ? (quota.free_credit ? 0 : quota.next_cost_max) : 0;
  const convo = a.messages.filter((m) => m.role === role);
  const shareableNone = a.documents.length === 0 || docIds.length === 0;

  async function send() {
    if (!role) return;
    setError(null);
    const r = await mutate((api2) => api2.sendMessage(a!.id, { role, text: text.trim(), document_ids: docIds, max_cost_confirmed: cost }));
    setConfirming(false);
    if (r.ok) setText("");
    else setError(r.error);
  }

  async function saveManual() {
    if (editing === null) return;
    setError(null);
    const r = await mutate((api2) => api2.saveArtifact(a!.id, { parent_id: selected?.id ?? null, content: editing }));
    if (r.ok) {
      setEditing(null);
      setPicked(null);
    } else setError(r.error);
  }

  async function hint(level: 1 | 2) {
    if (!api) return;
    setError(null);
    try {
      const r = await api.requestHint(a!.id, level);
      setHints((h) => ({ ...h, [level]: r.text }));
    } catch (e) {
      setError(e as ApiError);
    }
  }

  const demoOn = (id: DemoEventId) => !state.demo_events || state.demo_events.includes(id);

  async function demo(id: DemoEventId) {
    setError(null);
    const r = await mutate((api2) => api2.demoEvent(id));
    if (!r.ok) return setError(r.error);
    if (r.result.action?.status === "AWAITING_CONFIRMATION") router.push(`/plan/${r.result.action.id}`);
  }

  async function saveNotebook(m: { id: string; role: RoleId; text: string }) {
    if (!api) return;
    try {
      await api.saveNotebook({ title: m.text.slice(0, 40), prompt: m.text, role: m.role, mission_id: a!.mission_id });
      setSaved((s) => [...s, m.id]);
    } catch (e) {
      setError(e as ApiError);
    }
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length];
    if (t) {
      setTab(t.id);
      document.getElementById(`tab-${t.id}`)?.focus();
    }
  }

  const panelProps = (id: Tab, label: string) =>
    narrow ? { role: "tabpanel", "aria-labelledby": `tab-${id}`, hidden: tab !== id } : { "aria-label": label };

  return (
    <div className="page wide">
      <h1 className="h2">
        {a.mission_title} <span className="muted">· atelier</span>
      </h1>
      <StatusBar state={state} a={a} role={role} />
      {beginner ? <Tutorial a={a} role={role} inspected={inspected} onInspect={() => setInspected(true)} /> : null}
      {a.brief.version > 1 && a.brief.diff ? (
        <Notice tone="warn" title="Le brief a changé.">
          Consultez l&apos;onglet/colonne « Brief » pour voir les différences avant de continuer.
        </Notice>
      ) : null}
      {actions.map((x) => (
        <ActionBanner key={x.id} action={x} attemptId={a.id} />
      ))}
      <ErrorNote error={error} />

      {narrow ? (
        <div role="tablist" aria-label="Zones de l'atelier" className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKey}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="workshop">
        {/* Gauche : brief et pièces */}
        <section id="panel-mission" className="panel" {...panelProps("mission", "Brief et pièces")}>
          <h2 className="h3">Brief</h2>
          <BriefBlock brief={a.brief} />
          <h3 className="h4">Critères du client</h3>
          <CriteriaList criteria={a.criteria} />
          <h3 className="h4">Pièces à partager avec l&apos;agent</h3>
          <p className="help">
            Un <Term term="agent">agent</Term> ne connaît que ce que vous lui écrivez ou partagez. Les documents cochés sont
            les <Term term="source">sources</Term> de sa réponse.
          </p>
          <DocumentList documents={a.documents}>
            {(d) => (
              <label className="check">
                <input
                  type="checkbox"
                  checked={docIds.includes(d.id)}
                  onChange={(e) => setDocIds((cur) => (e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id)))}
                />
                Partager « {d.title} » avec l&apos;agent
              </label>
            )}
          </DocumentList>
          <p className="help">
            Questions au client : <strong>{a.clarifications.used}/{a.clarifications.max}</strong>.{" "}
            <Link href={`/commande/${a.id}`}>Poser une question</Link>
          </p>
          {state.hints_enabled === false ? null : (
          <div className="hints">
            <h3 className="h4">Besoin d&apos;aide ? (gratuit)</h3>
            <div className="row">
              <button type="button" className="btn btn-small" onClick={() => void hint(1)}>
                {hints[1] ? "Revoir l'indice 1" : "Indice 1"}
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void hint(2)}
                disabled={a.hints_used < 1 && !hints[1]}
                aria-describedby="hint2-why"
              >
                {hints[2] ? "Revoir l'indice 2" : "Indice 2"}
              </button>
            </div>
            {a.hints_used < 1 && !hints[1] ? (
              <p id="hint2-why" className="help">
                L&apos;indice 2 s&apos;ouvre après l&apos;indice 1.
              </p>
            ) : null}
            {([1, 2] as const).map((l) =>
              hints[l] ? (
                <p key={l} className="note note-info" role="note">
                  {hints[l]}
                </p>
              ) : null,
            )}
          </div>
          )}
        </section>

        {/* Centre : conversation */}
        <section id="panel-agent" className="panel" {...panelProps("agent", "Agent : conversation")}>
          <h2 className="h3">Agent</h2>
          <fieldset className="roles">
            <legend>Avec qui travaillez-vous ?</legend>
            {a.roles.map((r) => {
              const lockedWhy = !r.owned ? "verrouillé : à acheter dans la boutique" : null;
              return (
                <label key={r.role} className={`role ${role === r.role ? "role-on" : ""} ${!r.owned ? "role-locked" : ""}`}>
                  <input type="radio" name="role" checked={role === r.role} onChange={() => setRole(r.role)} />
                  <span>
                    <strong>{ROLE_LABEL[r.role]}</strong>
                    <span className="help block">
                      {lockedWhy ?? `${r.used}/${r.limit} messages utilisés`}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {role && quota && !quota.owned ? (
            <Notice tone="warn" title="Agent verrouillé.">
              Vous ne possédez pas encore {ROLE_LABEL[role]}. <Link href="/boutique">Voir la boutique</Link>
            </Notice>
          ) : null}

          <div className="log" role="log" aria-live="polite" aria-label="Conversation">
            {!role ? <p className="muted">Choisissez un agent pour voir la conversation.</p> : null}
            {role && convo.length === 0 ? <p className="muted">Aucun message pour l&apos;instant avec ce rôle.</p> : null}
            {convo.map((m) =>
              m.author === "player" ? (
                <div key={m.id} className="msg msg-player">
                  <p className="who">Vous</p>
                  <p className="pre">{m.text}</p>
                  <button type="button" className="btn btn-small" onClick={() => void saveNotebook(m)} disabled={saved.includes(m.id) || state.notebook_enabled === false}>
                    {saved.includes(m.id) ? "Enregistré dans le carnet" : state.notebook_enabled === false ? "Carnet bientôt disponible" : "Enregistrer dans le carnet"}
                  </button>
                </div>
              ) : (
                <div key={m.id} className="msg msg-agent">
                  <p className="who">
                    {ROLE_LABEL[m.role]} <Pill tone="info">Texte généré</Pill>
                  </p>
                  <SafeMarkdown text={m.text} />
                  <p className="help">
                    Sources utilisées :{" "}
                    {m.sources && m.sources.length > 0 ? m.sources.map((s) => s.title).join(", ") : "aucune (aucun document partagé pour ce message)"}
                  </p>
                  {m.known_facts && m.known_facts.length > 0 ? (
                    <div>
                      <p className="help">
                        <strong>Faits connus :</strong>
                      </p>
                      <ul className="plain">
                        {m.known_facts.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {m.proposals && m.proposals.length > 0 ? (
                    <div>
                      <p className="help">
                        <strong>Propositions de l&apos;agent (à vérifier) :</strong>
                      </p>
                      <ul className="plain">
                        {m.proposals.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>

          {limitReached ? (
            <Notice tone="warn" title="Tous les messages de cet agent sont utilisés.">
              La saisie est désactivée pour cet agent. Vous pouvez encore modifier le livrable à la main et le livrer.
            </Notice>
          ) : null}
          {a.documents.length > 0 && shareableNone ? (
            <Notice tone="info" title="Aucun document partagé.">
              L&apos;agent ne connaîtra que votre consigne. Cochez des documents dans « Brief » si besoin.
            </Notice>
          ) : null}

          <div className="field">
            <label htmlFor="prompt">Votre instruction pour {role ? ROLE_LABEL[role] : "l'agent"}</label>
            <p className="help">
              Cette instruction s&apos;appelle un <Term term="prompt">prompt</Term>.
            </p>
            <textarea
              id="prompt"
              rows={5}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setConfirming(false);
              }}
              disabled={typingDisabled}
              maxLength={4000}
              aria-describedby="send-why"
            />
            <p className="help">{text.length}/4000 caractères</p>
          </div>

          {!canSend ? (
            <ul id="send-why" className="why" role="status" aria-label="Pourquoi l'envoi est bloqué">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p id="send-why" className="sr-only">
              Envoi possible.
            </p>
          )}

          {confirming && canSend ? (
            <div className="confirm" role="group" aria-label="Confirmer l'envoi">
              <p>
                Coût maximal : <strong>{money(cost)}</strong>. Cet envoi utilise 1 de vos {quota?.limit} messages avec{" "}
                {role ? ROLE_LABEL[role] : "l'agent"} (il en restera {quota ? quota.limit - quota.used - 1 : 0}). Rien n&apos;est
                débité sans réponse exploitable.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={busy}>
                Confirmer l&apos;envoi
              </button>{" "}
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Annuler
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!canSend || busy} onClick={() => setConfirming(true)}>
              Envoyer à {role ? ROLE_LABEL[role] : "l'agent"}
            </button>
          )}
        </section>

        {/* Droite : livrable */}
        <section id="panel-deliverable" className="panel" {...panelProps("deliverable", "Livrable et versions")}>
          <h2 className="h3">Livrable</h2>
          {a.artifacts.length === 0 ? (
            <p className="muted">Aucun livrable pour l&apos;instant. Demandez une première version à un agent, ou écrivez-la vous-même.</p>
          ) : (
            <>
              <fieldset className="versions">
                <legend>Version affichée</legend>
                {a.artifacts.map((v) => (
                  <label key={v.id} className={`ver ${selected?.id === v.id ? "ver-on" : ""}`}>
                    <input
                      type="radio"
                      name="version"
                      checked={selected?.id === v.id}
                      onChange={() => {
                        setPicked({ id: v.id, count: a.artifacts.length });
                        setEditing(null);
                        setInspected(true);
                      }}
                    />
                    <span>
                      Version {v.number} · {v.author === "agent" ? `texte généré (${v.role ? ROLE_LABEL[v.role] : "agent"})` : "modification manuelle (vous)"}
                    </span>
                  </label>
                ))}
              </fieldset>
              {selected && editing === null ? (
                <article className="deliverable" aria-label={`Contenu de la version ${selected.number}`}>
                  <p>
                    {selected.author === "agent" ? <Pill tone="info">Texte généré par l&apos;agent</Pill> : <Pill tone="warn">Modification manuelle</Pill>}{" "}
                    <span className="muted">version sélectionnée : {selected.number}{selected.parent_id ? "" : " (première version)"}</span>
                  </p>
                  <SafeMarkdown text={selected.content} />
                  <p className="help">
                    Sources :{" "}
                    {selected.sources.length > 0 ? selected.sources.map((s) => s.title).join(", ") : selected.author === "player" ? "saisie manuelle" : "aucune"}
                  </p>
                </article>
              ) : null}
            </>
          )}

          {editing !== null ? (
            <div className="field">
              <label htmlFor="manual">Votre modification (sera enregistrée comme nouvelle version « manuelle »)</label>
              <textarea id="manual" rows={8} value={editing} onChange={(e) => setEditing(e.target.value)} />
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => void saveManual()} disabled={busy || editing.trim().length === 0}>
                  Enregistrer comme nouvelle version
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button type="button" className="btn" onClick={() => setEditing(selected?.content ?? "")} disabled={a.status !== "ACTIVE"}>
                {selected ? "Modifier à la main" : "Écrire un livrable à la main"}
              </button>
              {selected && a.status === "ACTIVE" ? (
                <Link className="btn btn-primary" href={`/livraison/${a.id}?v=${selected.id}`}>
                  Livrer la version {selected.number}
                </Link>
              ) : (
                <button type="button" className="btn btn-primary" disabled aria-describedby="deliver-why">
                  Livrer
                </button>
              )}
            </div>
          )}
          {!selected || a.status !== "ACTIVE" ? (
            <p id="deliver-why" className="help">
              {a.status !== "ACTIVE" ? "Cette expédition n'est plus en cours : aucune nouvelle livraison." : "Livraison impossible : aucun livrable n'existe encore."}
            </p>
          ) : null}
          <p className="help">Modifier à la main est gratuit et ne consomme aucun message.</p>
        </section>
      </div>

      {state.demo_enabled ? (
        <details className="card demo">
          <summary>Accès démo (présentateur) · événements simulés</summary>
          <p className="help">Réservé à la démonstration ; ne change ni note ni solde. Badge « Mode simulé » visible.</p>
          <div className="row">
            {demoOn("target_change") ? (
              <button type="button" className="btn btn-small" onClick={() => void demo("target_change")} disabled={busy}>
                Changement de cible (nouvelle version du brief)
              </button>
            ) : null}
            {demoOn("preview_lead_plan") ? (
              <button type="button" className="btn btn-small" onClick={() => void demo("preview_lead_plan")} disabled={busy}>
                Aperçu du plan du chef
              </button>
            ) : null}
            {demoOn("evaluation_outage") ? (
              <button type="button" className="btn btn-small" onClick={() => void demo("evaluation_outage")} disabled={busy}>
                Simuler une panne d&apos;évaluation
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function WorkshopScreen({ attemptId }: { attemptId: string }) {
  return <RequireSession>{(s) => <Workshop state={s} attemptId={attemptId} />}</RequireSession>;
}
