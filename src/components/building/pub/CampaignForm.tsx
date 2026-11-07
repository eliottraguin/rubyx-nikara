"use client";

import { useState } from "react";
import { OBJECTIFS, PLATEFORMES, type Campaign, type CampaignInput } from "@/lib/api/campaigns";

/** Création (sans `initial`) ou modification d'une campagne. Le budget est un texte indicatif : il ne touche jamais l'argent du jeu. */
export function CampaignForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Campaign;
  busy: boolean;
  onSubmit: (v: CampaignInput) => void;
  onCancel?: () => void;
}) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [objectif, setObjectif] = useState(initial?.objectif ?? "leads");
  const [plateforme, setPlateforme] = useState(initial?.plateforme ?? PLATEFORMES[0]?.id ?? "linkedin");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [budget, setBudget] = useState(initial?.budget_indicatif ?? "");
  const ok = nom.trim().length > 0;
  const id = initial ? `e-${initial.id}` : "new";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok || busy) return;
        onSubmit({ nom: nom.trim(), objectif, plateforme, audience: audience.trim(), budget_indicatif: budget.trim() });
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-nom`}>Nom de la campagne</label>
        <input id={`${id}-nom`} type="text" value={nom} maxLength={200} onChange={(e) => setNom(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-obj`}>Objectif</label>
        <select id={`${id}-obj`} value={objectif} onChange={(e) => setObjectif(e.target.value)}>
          {Object.entries(OBJECTIFS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-pf`}>Plateforme (choix des formats seulement : rien n&apos;y est publié)</label>
        <select id={`${id}-pf`} value={plateforme} onChange={(e) => setPlateforme(e.target.value)}>
          {PLATEFORMES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-aud`}>Audience</label>
        <textarea id={`${id}-aud`} rows={2} value={audience} maxLength={300} onChange={(e) => setAudience(e.target.value)} aria-describedby={`${id}-aud-h`} />
        <p className="help" id={`${id}-aud-h`}>Laissez vide : l&apos;audience est tirée de votre fiche cible.</p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-bud`}>Budget indicatif (texte libre)</label>
        <input id={`${id}-bud`} type="text" value={budget} maxLength={200} onChange={(e) => setBudget(e.target.value)} aria-describedby={`${id}-bud-h`} />
        <p className="help" id={`${id}-bud-h`}>Simple repère pour le plan : aucun budget n&apos;est dépensé et votre solde de jeu n&apos;est pas touché.</p>
      </div>
      <p>
        <button type="submit" className="btn btn-primary" disabled={!ok || busy}>
          {initial ? "Enregistrer" : "Créer la campagne"}
        </button>{" "}
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
        )}
      </p>
    </form>
  );
}
