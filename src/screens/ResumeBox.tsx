"use client";

import Link from "next/link";
import { Loading } from "@/components/ui";
import { money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

/** Reprise de session : état relu depuis l'API (GET /api/state). */
export function ResumeBox() {
  const { state, connectionLost } = useGame();
  if (state === undefined)
    return connectionLost ? (
      <p className="note note-bad" role="status">
        Connexion perdue : impossible de vérifier s&apos;il existe une partie à reprendre.
      </p>
    ) : (
      <Loading label="Recherche d'une partie à reprendre…" />
    );
  if (!state?.session) return <p className="muted">Aucune partie à reprendre pour l&apos;instant.</p>;
  const s = state.session;
  return (
    <div className="card card-accent">
      <h2>Reprendre votre partie</h2>
      <p>
        <strong>{s.company}</strong> · mode {s.mode === "beginner" ? "Débutant" : "Expert"} · {state.stage.label} · solde
        disponible {money(state.balance.available)}
      </p>
      <Link className="btn btn-primary" href="/carte">
        Reprendre sur la carte
      </Link>
    </div>
  );
}
