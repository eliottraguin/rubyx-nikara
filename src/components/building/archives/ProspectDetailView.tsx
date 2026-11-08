import { PertinenceBadge } from "@/components/search/PertinenceBadge";
import { MESSAGES } from "@/content/recherche";
import { useState } from "react";
import { ApiError } from "@/lib/api/types";
import { STATUTS, fiabiliteLabel, statutLabel, type ProspectDetail, type ProspectsClient } from "@/lib/api/prospects";
import { fmtDate } from "./ProspectTable";
import { DraftsPanel } from "./DraftsPanel";
import type { DraftsApi } from "@/lib/api/drafts";
import type { SearchesApi } from "@/lib/api/searches";

const CANAL: Record<string, string> = {
  email_generique: "Email générique",
  formulaire: "Formulaire",
  adresse: "Adresse",
  telephone_standard: "Téléphone du standard",
  reseau_pro: "Réseau pro",
};

/** Fiche d'un prospect. Tout est rendu en texte. `onChange` reçoit la version serveur après chaque modification. */
export function ProspectDetailView({
  prospect,
  client,
  drafts,
  contacts,
  notesMax = 2000,
  onChange,
  onDeleted,
  onClose,
}: {
  prospect: ProspectDetail;
  client: ProspectsClient;
  /** Injectables pour les tests (défaut : client du mode courant). */
  drafts?: DraftsApi;
  contacts?: SearchesApi;
  notesMax?: number;
  onChange: (p: ProspectDetail) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(prospect.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dirty = notes !== prospect.notes;

  async function patch(body: { statut?: string; notes?: string }) {
    setBusy(true);
    setError(null);
    setWon(false);
    try {
      const next = await client.patch(prospect.id, { version: prospect.version, ...body });
      if (body.statut === "gagne" && prospect.statut !== "gagne") setWon(true);
      setConflict(false);
      setNotes(next.notes);
      onChange(next);
    } catch (e) {
      if (e instanceof ApiError && e.code === "VERSION_CONFLICT") setConflict(true);
      else if (e instanceof ApiError && e.code === "INVALID_STATE" && body.statut === "gagne") setError("Ce prospect ne vous a pas encore répondu : vous ne pouvez pas le compter comme client.");
      else setError(e instanceof ApiError ? e.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setBusy(true);
    try {
      const next = await client.get(prospect.id);
      setNotes(next.notes);
      setConflict(false);
      onChange(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await client.remove(prospect.id);
      onDeleted(prospect.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Une erreur est survenue.");
      setBusy(false);
    }
  }

  const contact = [prospect.contact_nom, prospect.contact_fonction].filter(Boolean).join(", ");
  return (
    <section className="card" aria-labelledby="prospect-title">
      <div className="row">
        <h3 className="h3" id="prospect-title" tabIndex={-1}>
          {prospect.entreprise}
        </h3>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Fermer la fiche
        </button>
      </div>
      <dl>
        <dt>Statut</dt>
        <dd>{statutLabel(prospect.statut)}{prospect.contacte_le ? ` (contacté le ${fmtDate(prospect.contacte_le)})` : ""}</dd>
        <dt>Source</dt>
        <dd>{prospect.source}{prospect.simule ? " (données simulées)" : ""}</dd>
        <dt>Date de collecte</dt>
        <dd>{fmtDate(prospect.collecte_le)}</dd>
        <dt>Fiabilité</dt>
        <dd>{fiabiliteLabel(prospect.fiabilite)}</dd>
        <dt>Correspondance avec votre cible</dt>
        <dd>
          <PertinenceBadge value={prospect.pertinence_etiquette} />
        </dd>
        <dt>Citation de la source</dt>
        <dd>{prospect.pertinence_citation ? <q>{prospect.pertinence_citation}</q> : <span className="muted">{MESSAGES.pasDeCitation}</span>}</dd>
        {contact ? (
          <>
            <dt>Contact</dt>
            <dd>{contact}</dd>
          </>
        ) : null}
        {prospect.canal ? (
          <>
            <dt>{CANAL[prospect.canal.type] ?? "Canal"}</dt>
            <dd>{prospect.canal.valeur}</dd>
          </>
        ) : null}
        {prospect.signal ? (
          <>
            <dt>Signal</dt>
            <dd>{prospect.signal}</dd>
          </>
        ) : null}
      </dl>
      {prospect.raisons_fit.length ? (
        <>
          <h4 className="h3">Pourquoi ce prospect correspond</h4>
          <ul>
            {prospect.raisons_fit.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="field">
        <label htmlFor="prospect-statut">Changer le statut</label>
        <div className="row">
          <select id="prospect-statut" value={prospect.statut} disabled={busy} onChange={(e) => void patch({ statut: e.target.value })}>
            {[...new Set<string>([prospect.statut, ...STATUTS])].map((s) => (
              <option key={s} value={s}>
                {statutLabel(s)}
              </option>
            ))}
          </select>
          {prospect.statut === "nouveau" ? (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void patch({ statut: "contacte" })}>
              Marquer contacté
            </button>
          ) : null}
        </div>
        <p className="help">« Contacté » est une déclaration de votre part : rien n&apos;est envoyé.</p>
      </div>

      <div className="field">
        <label htmlFor="prospect-notes">Notes</label>
        <textarea id="prospect-notes" rows={4} maxLength={notesMax} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} />
        <div className="row">
          <button type="button" className="btn btn-small btn-primary" disabled={busy || !dirty} onClick={() => void patch({ notes })}>
            Enregistrer les notes
          </button>
          <span className="help">{notes.length} / {notesMax}</span>
        </div>
      </div>

      {conflict ? (
        <div className="note note-warn" role="alert">
          Cette fiche a été modifiée ailleurs depuis votre lecture. Rechargez-la avant de réessayer ; vos notes en cours restent dans le champ.
          <div className="row">
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => void reload()}>
              Recharger la fiche
            </button>
          </div>
        </div>
      ) : null}
      {won ? (
        <p className="note" role="status">
          Félicitations, un nouveau client ! +20 $ ajoutés à votre solde.
        </p>
      ) : null}
      {error ? (
        <p className="note note-bad" role="alert">
          {error}
        </p>
      ) : null}

      <h4 className="h3">Fiche client et premier message</h4>
      <DraftsPanel prospectId={prospect.id} entreprise={prospect.entreprise} api={drafts} contact={contacts} />

      {prospect.historique_statut.length ? (
        <>
          <h4 className="h3">Historique des statuts</h4>
          <ol>
            {prospect.historique_statut.map((h, i) => (
              <li key={i}>
                {statutLabel(h.statut)} le {fmtDate(h.le)}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {confirming ? (
        <div className="note note-warn" role="alertdialog" aria-label="Confirmer la suppression">
          <p>Supprimer définitivement « {prospect.entreprise} » du carnet ? Cette action est irréversible.</p>
          <div className="row">
            <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void remove()}>
              Oui, supprimer
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => setConfirming(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => setConfirming(true)}>
          Supprimer ce prospect
        </button>
      )}
    </section>
  );
}
