"use client";

import { useState } from "react";
import { fieldSpec, type AdKit, type AdKitInput } from "@/lib/api/campaigns";
import { Counter } from "./KitView";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/**
 * Copie éditée d'un kit : crée une nouvelle version (auteur « joueur »), l'originale reste intacte. Gratuit.
 * Le texte modifié est celui du joueur ; le serveur recontrôle tout (limites, faits de la fiche).
 */
export function KitEditor({
  kit,
  busy,
  onSave,
  onCancel,
}: {
  kit: AdKit;
  busy: boolean;
  onSave: (k: AdKitInput) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<AdKit>(() => structuredClone(kit));
  const [plan, setPlan] = useState({
    calendrier: kit.plan.calendrier.join("\n"),
    repartition_budget: kit.plan.repartition_budget.join("\n"),
    indicateurs: kit.plan.indicateurs.join("\n"),
  });
  const [verif, setVerif] = useState(kit.a_verifier.join("\n"));

  const setText = (fi: number, field: string, ti: number, v: string) =>
    setD((p) => ({
      ...p,
      textes: p.textes.map((t, i) => (i !== fi ? t : { ...t, champs: { ...t.champs, [field]: t.champs[field]!.map((x, j) => (j === ti ? v : x)) } })),
    }));

  return (
    <form
      aria-label="Modifier une copie du kit"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        onSave({
          ...d,
          plan: { calendrier: lines(plan.calendrier), repartition_budget: lines(plan.repartition_budget), indicateurs: lines(plan.indicateurs) },
          a_verifier: lines(verif),
          checklist: d.checklist.map((c) => ({ id: c.id })),
        });
      }}
    >
      <p className="note note-info">Vous modifiez une copie : l&apos;original reste intact et la copie est gratuite.</p>
      <div className="field">
        <label htmlFor="ke-pos">Positionnement</label>
        <textarea id="ke-pos" rows={3} value={d.positionnement} onChange={(e) => setD({ ...d, positionnement: e.target.value })} />
      </div>
      <fieldset className="field">
        <legend>Accroches</legend>
        {d.accroches.map((a, i) => (
          <div key={i}>
            <label htmlFor={`ke-acc-${i}`} className="sr-only">Accroche {i + 1}</label>
            <input
              id={`ke-acc-${i}`}
              type="text"
              value={a.texte}
              onChange={(e) => setD({ ...d, accroches: d.accroches.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)) })}
            />
            <p className="help">Champ de la fiche : {a.fiche}</p>
          </div>
        ))}
      </fieldset>
      {d.textes.map((t, fi) =>
        Object.entries(t.champs).map(([field, texts]) => {
          const spec = fieldSpec(t.format, field);
          return (
            <fieldset className="field" key={`${t.format}-${field}`}>
              <legend>
                {spec.formatLabel} : {spec.fieldLabel}
              </legend>
              {texts.map((txt, ti) => (
                <div key={ti}>
                  <label htmlFor={`ke-${fi}-${field}-${ti}`} className="sr-only">
                    {spec.fieldLabel} {ti + 1}
                  </label>
                  <textarea id={`ke-${fi}-${field}-${ti}`} rows={2} value={txt} onChange={(e) => setText(fi, field, ti, e.target.value)} />
                  <div className="count">
                    <Counter n={[...txt].length} max={spec.max} />
                  </div>
                </div>
              ))}
            </fieldset>
          );
        }),
      )}
      <fieldset className="field">
        <legend>Brief visuel</legend>
        {(
          [
            ["sujet", "Sujet"],
            ["style", "Style"],
            ["texte_image", "Texte sur l'image"],
            ["format_dimensions", "Format et dimensions"],
            ["prompt", "Prompt pour un outil d'image"],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <label htmlFor={`ke-b-${k}`}>{label}</label>
            <textarea id={`ke-b-${k}`} rows={2} value={d.brief_visuel[k]} onChange={(e) => setD({ ...d, brief_visuel: { ...d.brief_visuel, [k]: e.target.value } })} />
          </div>
        ))}
      </fieldset>
      <fieldset className="field">
        <legend>Plan (une ligne par élément)</legend>
        {(
          [
            ["calendrier", "Calendrier"],
            ["repartition_budget", "Répartition du budget"],
            ["indicateurs", "Indicateurs"],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <label htmlFor={`ke-p-${k}`}>{label}</label>
            <textarea id={`ke-p-${k}`} rows={3} value={plan[k]} onChange={(e) => setPlan({ ...plan, [k]: e.target.value })} />
          </div>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="ke-verif">À vérifier (une ligne par point)</label>
        <textarea id="ke-verif" rows={3} value={verif} onChange={(e) => setVerif(e.target.value)} />
      </div>
      <p>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Enregistrer la copie
        </button>{" "}
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
      </p>
    </form>
  );
}
