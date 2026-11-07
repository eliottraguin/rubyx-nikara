"use client";

import { useState } from "react";
import { exportUrl, objectifLabel, platformLabel, type AdKitInput, type Campaign, type CampaignInput } from "@/lib/api/campaigns";
import { CampaignForm } from "./CampaignForm";
import { KitEditor } from "./KitEditor";
import { Controls, KitView } from "./KitView";

const QUOTA = 5;
const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
};

export interface CampaignDetailProps {
  campaign: Campaign;
  /** Version affichée (numéro). */
  selected: number | null;
  onSelect: (numero: number) => void;
  /** L'agent `ads` est-il engagé ? Sinon la génération est verrouillée (ROLE_LOCKED côté serveur). */
  adsOwned: boolean;
  available: number | null;
  busy: boolean;
  onGenerate: (consigne: string) => void;
  onPatch: (v: CampaignInput) => void;
  onSaveCopy: (versionId: string, kit: AdKitInput) => void;
  onDelete: () => void;
  onBack: () => void;
}

export function CampaignDetail(p: CampaignDetailProps) {
  const c = p.campaign;
  const [consigne, setConsigne] = useState(c.consigne ?? "");
  const [editing, setEditing] = useState<"campaign" | "kit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const version = c.versions.find((v) => v.numero === p.selected) ?? c.versions[c.versions.length - 1] ?? null;
  const left = Math.max(0, c.generations_remaining);
  const nextN = QUOTA - left + 1;
  const lacksFunds = p.available !== null && p.available < c.generation_cost;
  const canGenerate = p.adsOwned && left > 0 && !p.busy;

  return (
    <div>
      <p>
        <button type="button" className="back" onClick={p.onBack}>
          ← Toutes les campagnes
        </button>
      </p>
      <h3 className="h3">{c.nom}</h3>
      <p className="help">
        {objectifLabel(c.objectif)} · {platformLabel(c.plateforme)} · Audience : {c.audience}
        {c.budget_indicatif ? ` · Budget indicatif : ${c.budget_indicatif}` : ""}
      </p>

      {editing === "campaign" ? (
        <CampaignForm initial={c} busy={p.busy} onSubmit={(v) => { p.onPatch(v); setEditing(null); }} onCancel={() => setEditing(null)} />
      ) : (
        <p>
          <button type="button" className="btn btn-small" onClick={() => setEditing("campaign")}>
            Modifier la campagne
          </button>{" "}
          {confirmDelete ? (
            <span className="confirm" role="alertdialog" aria-label="Confirmer la suppression">
              Supprimer cette campagne et toutes ses versions ?{" "}
              <button type="button" className="btn btn-small" onClick={p.onDelete} disabled={p.busy}>
                Oui, supprimer
              </button>{" "}
              <button type="button" className="btn btn-small" onClick={() => setConfirmDelete(false)}>
                Non, garder
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </button>
          )}
        </p>
      )}

      <section className="card" aria-label="Générer un kit">
        <h4 className="h3">Faire préparer un kit par le directeur de campagne</h4>
        {!p.adsOwned && (
          <p className="note note-warn" role="alert">
            Le directeur de campagne n&apos;est pas encore engagé : engagez-le à l&apos;étage « Accueil et garage ».
          </p>
        )}
        <div className="field">
          <label htmlFor="gen-consigne">Consigne facultative</label>
          <textarea id="gen-consigne" rows={2} value={consigne} maxLength={500} onChange={(e) => setConsigne(e.target.value)} />
        </div>
        <div className="cost-box">
          <dl className="kv">
            <div><dt>Coût maximal</dt><dd>{c.generation_cost} $</dd></div>
            <div><dt>Génération</dt><dd>{left > 0 ? `${nextN} sur ${QUOTA}` : `${QUOTA} sur ${QUOTA} : quota atteint`}</dd></div>
            {p.available !== null && <div><dt>Votre solde</dt><dd>{p.available} $</dd></div>}
          </dl>
          <p className="help">Débité seulement si le kit est exploitable. Rien n&apos;est publié ni dépensé en publicité.</p>
        </div>
        {lacksFunds && p.adsOwned && <p className="note note-warn">Votre solde est inférieur au coût maximal : le serveur refusera la génération.</p>}
        <p>
          <button type="button" className="btn btn-primary" disabled={!canGenerate} onClick={() => p.onGenerate(consigne)}>
            {p.busy ? "Travail en cours…" : `Générer un kit (${c.generation_cost} $ au plus)`}
          </button>
        </p>
      </section>

      <section aria-label="Versions du kit">
        <h4 className="h3">Versions du kit</h4>
        {c.versions.length === 0 ? (
          <p className="help">Aucun kit pour le moment.</p>
        ) : (
          <>
            <ul className="tabs" aria-label="Choisir une version">
              {c.versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={v.id === version?.id ? "btn btn-small btn-primary" : "btn btn-small"}
                    aria-pressed={v.id === version?.id}
                    onClick={() => { p.onSelect(v.numero); setEditing(null); }}
                  >
                    Version {v.numero} · {v.auteur === "joueur" ? "votre copie" : "agent"}
                  </button>
                </li>
              ))}
            </ul>
            {version && (
              <div>
                <p className="help">
                  {version.auteur === "joueur" ? "Copie éditée par vous" : "Produit par l'agent « ads »"}
                  {version.parent_id ? " (dérivée d'une version précédente)" : ""} · {fmt(version.cree_le)}
                  {version.profile_version ? ` · fiche entreprise v${version.profile_version}` : ""}{" "}
                  {version.simule && <span className="badge-sim">Simulé</span>}
                </p>
                <p>
                  <a className="btn btn-small" href={exportUrl(c.id, version.numero)}>
                    Exporter en Markdown
                  </a>{" "}
                  {editing !== "kit" && (
                    <button type="button" className="btn btn-small" onClick={() => setEditing("kit")}>
                      Modifier une copie
                    </button>
                  )}
                </p>
                {editing === "kit" ? (
                  <KitEditor kit={version.kit} busy={p.busy} onSave={(k) => { p.onSaveCopy(version.id, k); setEditing(null); }} onCancel={() => setEditing(null)} />
                ) : (
                  <>
                    <Controls version={version} />
                    <KitView kit={version.kit} />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
