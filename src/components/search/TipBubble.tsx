"use client";

import { TIP_LABELS, TIPS, type Tip } from "@/content/recherche";
import type { Tips } from "./useTips";

/** Bulle d'aide du Tutoriel : texte statique des données, jamais produit par un modèle ; ne vole pas le focus. */
export function TipBubble({ id, tips }: { id: Tip["id"]; tips: Tips }) {
  if (!tips.visible(id)) return null;
  const tip = TIPS[id];
  return (
    <aside className="tip" role="note" aria-label={`${TIP_LABELS.region} : ${tip.title}`}>
      <strong className="tip-title">{tip.title}</strong>
      <p className="tip-text">{tip.text}</p>
      <p className="tip-actions">
        <button type="button" className="btn btn-small" onClick={() => tips.dismiss(id)}>
          {TIP_LABELS.dismiss}
        </button>{" "}
        <button type="button" className="linklike" onClick={tips.disableAll}>
          {TIP_LABELS.disableAll}
        </button>
      </p>
    </aside>
  );
}

/** Réactiver les bulles après les avoir désactivées (Tutoriel seulement). */
export function TipsToggle({ tips }: { tips: Tips }) {
  if (!tips.available || !tips.off) return null;
  return (
    <p className="help">
      <button type="button" className="linklike" onClick={tips.enableAll}>
        {TIP_LABELS.enableAll}
      </button>
    </p>
  );
}
