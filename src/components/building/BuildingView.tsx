"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FLOORS, stepFloor, type Floor, type FloorId } from "@/game/building/floors";
import { ArchivesPanel } from "./ArchivesPanel";
import { CourrierPanel } from "./CourrierPanel";
import { PubPanel } from "./PubPanel";
import { ToitPanel } from "./ToitPanel";
import { AccueilPanel } from "./AccueilPanel";
import { useSearch } from "@/components/search/useSearch";
import { useAssistant } from "@/components/assistant/useAssistant";
import { useTips } from "@/components/search/useTips";
import type { ApiError, GameState, RoleId } from "@/lib/api/types";

export interface BuildingViewProps {
  state: GameState;
  busy: boolean;
  /** Étage ouvert au départ (paramètre d'URL). */
  initialFloor?: FloorId | null;
  onBuy: (role: RoleId) => Promise<ApiError | null>;
  /** Retour à la ville (Échap ou bouton). */
  onLeave: () => void;
  /** Conversation à ouvrir dans la salle du courrier (paramètre d'URL). */
  initialConversationId?: string | null;
  /** Une recherche du bot vient de réussir (relire l'état : déblocages). */
  onSearchDone?: () => void;
  /** Appelé quand l'étage ouvert change (mise à jour de l'URL). */
  onFloorChange?: (floor: Floor | null) => void;
}

function targetIsField(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

/** Vue « Immeuble » : liste des étages (flèches, Entrée, Échap) et panneau de l'étage ouvert. Texte brut uniquement. */
export function BuildingView({ state, busy, initialFloor = null, initialConversationId = null, onSearchDone, onBuy, onLeave, onFloorChange }: BuildingViewProps) {
  const initialIdx = initialFloor ? FLOORS.findIndex((f) => f.id === initialFloor) : -1;
  const [open, setOpen] = useState<FloorId | null>(initialIdx >= 0 ? FLOORS[initialIdx]!.id : null);
  const [cursor, setCursor] = useState(Math.max(0, initialIdx));
  const [live, setLive] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const tips = useTips(state.session?.mode !== "expert");
  const search = useSearch({ onDone: onSearchDone });
  const assistant = useAssistant({ onSpent: onSearchDone });
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const leave = useRef(onLeave);
  useEffect(() => {
    leave.current = onLeave;
  }, [onLeave]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || targetIsField(e.target)) return;
      e.preventDefault();
      setLive("Retour à la ville.");
      leave.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openFloor(i: number, conv: string | null = null) {
    const f = FLOORS[i]!;
    setConversationId(conv);
    setCursor(i);
    setOpen(f.id);
    setLive(`${f.label} ouvert : ${f.section}.`);
    onFloorChange?.(f);
    requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
  }

  function openFloorById(id: FloorId, conv: string | null = null) {
    const i = FLOORS.findIndex((f) => f.id === id);
    if (i >= 0) openFloor(i, conv);
  }
  /** « Contacter » : la conversation s'ouvre dans la salle du courrier. */
  const openConversation = (id: string) => openFloorById("courrier", id);

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const at = btns.current.findIndex((b) => b !== null && b === document.activeElement);
      const i = stepFloor(at >= 0 ? at : cursor, e.key === "ArrowUp" ? -1 : 1);
      setCursor(i);
      setLive(`Étage : ${FLOORS[i]!.label}.`);
      btns.current[i]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const at = btns.current.findIndex((b) => b !== null && b === document.activeElement);
      openFloor(at >= 0 ? at : cursor);
    }
  }

  let panel: ReactNode = null;
  if (open === "toit") panel = <ToitPanel state={state} />;
  else if (open === "pub") panel = <PubPanel state={state} />;
  else if (open === "courrier") panel = <CourrierPanel key={conversationId ?? "liste"} state={state} initialConversationId={conversationId} />;
  else if (open === "archives") panel = <ArchivesPanel state={state} />;
  else if (open === "accueil") panel = <AccueilPanel state={state} busy={busy} onBuy={onBuy} search={search} assistant={assistant} tips={tips} onOpenConversation={openConversation} onOpenCarnet={() => openFloorById("archives")} />;

  return (
    <div className="building-view">
      <div className="building-head">
        <h1 className="h2">Votre immeuble{state.session?.company ? ` : ${state.session.company}` : ""}</h1>
        <button type="button" className="btn btn-small" onClick={onLeave}>
          Retour à la ville (Échap)
        </button>
      </div>
      <p className="help">Flèches haut et bas pour choisir un étage, Entrée pour l&apos;ouvrir, Échap pour revenir à la ville.</p>
      <div className="building-body">
        <nav aria-label="Étages">
          <ul className="floor-list" onKeyDown={onKeyDown} aria-label="Liste des étages">
            {FLOORS.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  ref={(el) => {
                    btns.current[i] = el;
                  }}
                  tabIndex={i === cursor ? 0 : -1}
                  className={`planet-item ${open === f.id ? "floor-on" : ""}`}
                  aria-current={open === f.id ? "true" : undefined}
                  onClick={() => openFloor(i)}
                  onFocus={() => setCursor(i)}
                >
                  <span className="planet-item-main">
                    <strong>{f.label}</strong>
                    <span className="planet-item-sub">
                      {f.section} · {f.summary}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="floor-panel" ref={panelRef} tabIndex={-1} aria-label={open ? "Étage ouvert" : undefined}>
          {panel ?? <p className="muted">Choisissez un étage pour l&apos;ouvrir.</p>}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="building-live">
        {live}
      </p>
    </div>
  );
}
