"use client";

import type { ReactNode } from "react";

/**
 * Panneau latéral de la carte. ≥ 900 px : colonne de droite. Sur mobile (390 px) : feuille basse repliable, avec une
 * poignée toujours visible (titre + résumé) pour que la carte reste visible.
 */
export function SidePanel({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <aside className={`side-panel ${open ? "is-open" : ""}`} aria-label={title}>
      <button type="button" className="sheet-handle" aria-expanded={open} aria-controls="side-panel-body" onClick={onToggle}>
        <span className="sheet-grip" aria-hidden="true" />
        <span className="sheet-title">{title}</span>
        {summary ? <span className="sheet-summary">{summary}</span> : null}
        <span className="sheet-caret" aria-hidden="true">
          {open ? "▾" : "▴"}
        </span>
      </button>
      <div id="side-panel-body" className="side-panel-body">
        {children}
      </div>
    </aside>
  );
}
