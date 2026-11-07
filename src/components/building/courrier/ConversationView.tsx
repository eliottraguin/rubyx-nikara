"use client";

import { useCallback, useEffect, useState } from "react";
import type { Brouillon, ConversationDetail, ConversationsApi } from "@/lib/api/conversations";
import { describeProblem, type CourrierProblem } from "./errors";
import { Problem } from "./Problem";

/** Coûts maximaux affichés avant l'action (data/rules/rules_v2.json : conversation_triage 1, conversation_reply 2). Le serveur reste maître. */
export const TRIAGE_COST = 1;
export const REPLY_COST = 2;
const QUOTA = 5;

const INTENTIONS: Record<string, string> = {
  interesse: "Intéressé",
  question: "Question",
  objection: "Objection",
  refus: "Refus",
  desinscription: "Demande de désinscription",
  hors_sujet: "Hors sujet",
};
const URGENCES: Record<string, string> = { faible: "faible", normale: "normale", elevee: "élevée" };

interface Props {
  api: ConversationsApi;
  id: string;
  /** Tutoriel : clients simulés, envoi simulé. Réel : pas d'envoi tant que la boîte mail n'est pas connectée (jalon O). */
  tutoriel: boolean;
  onChanged: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

function latestDraft(list: Brouillon[]): Brouillon | null {
  return list.length ? [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1)! : null;
}

export function ConversationView({ api, id, tutoriel, onChanged, onDeleted, onClose }: Props) {
  const [d, setD] = useState<ConversationDetail | null>(null);
  const [problem, setProblem] = useState<CourrierProblem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [compose, setCompose] = useState("");
  const [usedDraft, setUsedDraft] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const det = await api.detail(id);
      setD(det);
      const dr = latestDraft(det.brouillons);
      setDraftId((prev) => {
        if (dr && dr.id !== prev) setDraftText(dr.corps);
        return dr ? dr.id : null;
      });
    } catch (e) {
      setProblem(describeProblem(e));
    }
  }, [api, id]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function run(label: string, fn: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(label);
    setProblem(null);
    try {
      await fn();
      after?.();
      await load();
      onChanged();
    } catch (e) {
      setProblem(describeProblem(e));
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!d) {
    return (
      <section className="card" aria-label="Conversation">
        <Problem problem={problem} />
        {problem ? null : <p className="help">Chargement de la conversation…</p>}
        <button type="button" className="btn btn-small" onClick={onClose}>
          Retour à la liste
        </button>
      </section>
    );
  }

  const left = (role: "triage" | "replier") => d.quota_restant[role] ?? QUOTA;
  const used = (role: "triage" | "replier") => Math.min(QUOTA, Math.max(0, QUOTA - left(role)));
  const ouverte = d.etat === "ouverte";
  const draft = latestDraft(d.brouillons);

  return (
    <section className="card" aria-labelledby="conv-title">
      <div className="building-head">
        <h3 className="h3" id="conv-title">
          {d.entreprise ?? "Prospect"}
        </h3>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Retour à la liste
        </button>
      </div>
      <p className="help">
        {d.statut_prospect ? `Statut : ${d.statut_prospect}. ` : ""}Réponses du client : {d.tours_client} sur {d.tours_client_max}.
      </p>
      {tutoriel ? (
        <p className="note note-info" role="note">
          {d.bandeau ?? "Client simulé : rien n'est envoyé hors du jeu."}
        </p>
      ) : (
        <p className="note note-info" role="note">
          Mode Réel : l&apos;envoi d&apos;un vrai email n&apos;est pas encore disponible (il demandera la connexion de votre boîte mail et votre confirmation
          explicite). Vous pouvez lire le fil, demander une synthèse et préparer un brouillon.
        </p>
      )}
      <Problem problem={problem} />
      {d.etat === "desinscrit" ? (
        <p className="note note-warn" role="note">
          Ce prospect a demandé à ne plus être contacté : aucun message ne peut lui être envoyé.
        </p>
      ) : null}
      {d.etat === "close" ? (
        <p className="note note-info" role="note">
          Conversation close.
        </p>
      ) : null}

      <h4 className="h4">Fil de messages</h4>
      {d.messages.length === 0 ? (
        <p className="help">Aucun message pour le moment. Écrivez le premier ci-dessous.</p>
      ) : (
        <ol className="thread" aria-label="Fil de messages">
          {d.messages.map((m) => (
            <li key={m.id}>
              <strong>{m.sens === "recu" ? "Le client" : "Vous"}</strong>
              {m.sens === "envoye" && m.simule ? " (simulé, non envoyé)" : ""}
              <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
            </li>
          ))}
        </ol>
      )}

      <h4 className="h4">Synthèse du trieur</h4>
      {d.synthese ? (
        <div>
          <p>
            <strong>{INTENTIONS[d.synthese.intention] ?? d.synthese.intention}</strong>, urgence {URGENCES[d.synthese.urgence] ?? d.synthese.urgence}.
            {d.synthese.desinscription_detectee_par_code ? " Désinscription détectée." : ""}
          </p>
          <ul>
            {d.synthese.points.map((p, i) => (
              <li key={i}>
                {p.texte} <q>{p.citation}</q>
              </li>
            ))}
          </ul>
          {d.synthese.controles.filter((c) => !c.reussi).map((c) => (
            <p key={c.id} className="help">
              Contrôle non réussi : {c.label}
              {c.detail ? ` (${c.detail})` : ""}
            </p>
          ))}
        </div>
      ) : (
        <p className="help">Pas encore de synthèse.</p>
      )}
      <p>
        <button
          type="button"
          className="btn btn-small"
          disabled={busy !== null || left("triage") <= 0 || d.messages.length === 0}
          onClick={() => void run("triage", () => api.triage(id))}
        >
          {busy === "triage" ? "Synthèse en cours…" : "Résumer avec le trieur"}
        </button>{" "}
        <span className="help">
          Coût maximal {TRIAGE_COST} $ · {used("triage")}/{QUOTA} générations utilisées
        </span>
      </p>

      <h4 className="h4">Brouillon de réponse</h4>
      {draft ? (
        <div>
          <label htmlFor="draft-text">
            Brouillon {draft.auteur === "joueur" ? "(votre version)" : "du rédacteur"}
            {draft.objet ? ` : ${draft.objet}` : ""}
          </label>
          <textarea id="draft-text" rows={6} style={{ width: "100%" }} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
          {draft.a_verifier.length ? (
            <ul className="help">
              {draft.a_verifier.map((a, i) => (
                <li key={i}>À vérifier : {a}</li>
              ))}
            </ul>
          ) : null}
          <p>
            <button
              type="button"
              className="btn btn-small"
              disabled={busy !== null || !draftText.trim() || draftText === draft.corps}
              onClick={() => void run("draft", () => api.editDraft(id, draft.id, draftText, draft.objet))}
            >
              Enregistrer ma version
            </button>{" "}
            <button
              type="button"
              className="btn btn-small"
              disabled={!draftText.trim()}
              onClick={() => {
                setCompose(draftText);
                setUsedDraft(draftId);
              }}
            >
              Utiliser ce brouillon
            </button>
          </p>
        </div>
      ) : (
        <p className="help">Pas encore de brouillon.</p>
      )}
      <p>
        <button
          type="button"
          className="btn btn-small"
          disabled={busy !== null || left("replier") <= 0 || d.messages.length === 0 || !ouverte}
          onClick={() => void run("reply", () => api.reply(id))}
        >
          {busy === "reply" ? "Rédaction en cours…" : "Rédiger un brouillon"}
        </button>{" "}
        <span className="help">
          Coût maximal {REPLY_COST} $ · {used("replier")}/{QUOTA} générations utilisées
        </span>
      </p>

      <h4 className="h4">{tutoriel ? "Envoyer (simulé)" : "Message"}</h4>
      <label htmlFor="compose">Votre message</label>
      <textarea
        id="compose"
        rows={5}
        style={{ width: "100%" }}
        value={compose}
        disabled={!ouverte}
        onChange={(e) => {
          setCompose(e.target.value);
          setSentNote(null);
        }}
      />
      {tutoriel ? (
        <p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null || !ouverte || !compose.trim()}
            onClick={() =>
              void run(
                "send",
                async () => {
                  const r = await api.send(id, compose, usedDraft);
                  setSentNote(
                    r.client_error
                      ? "Le client simulé n'a pas pu répondre (rien n'a été débité). Réessayez en envoyant un message."
                      : "Rien n'est parti : client simulé.",
                  );
                },
                () => {
                  setCompose("");
                  setUsedDraft(null);
                },
              )
            }
          >
            {busy === "send" ? "Envoi simulé…" : "Envoyer (simulé)"}
          </button>
        </p>
      ) : (
        <p className="help">Copiez ce texte pour l&apos;envoyer vous-même : le jeu n&apos;envoie rien pour l&apos;instant.</p>
      )}
      {sentNote ? (
        <p className="note note-info" role="status">
          {sentNote}
        </p>
      ) : null}

      <hr />
      {confirmDelete ? (
        <p role="alertdialog" aria-label="Confirmer la suppression">
          Supprimer cette conversation (messages, brouillons et synthèses) ? Le prospect reste au carnet.{" "}
          <button type="button" className="btn btn-small btn-primary" disabled={busy !== null} onClick={() => void run("del", () => api.remove(id), onDeleted)}>
            Oui, supprimer
          </button>{" "}
          <button type="button" className="btn btn-small" onClick={() => setConfirmDelete(false)}>
            Annuler
          </button>
        </p>
      ) : (
        <button type="button" className="btn btn-small" onClick={() => setConfirmDelete(true)}>
          Supprimer la conversation
        </button>
      )}
    </section>
  );
}
