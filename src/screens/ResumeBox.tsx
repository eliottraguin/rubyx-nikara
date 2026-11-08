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
  if (!state?.session) return null;
  const s = state.session;
  return (
    <p className="muted">
      Partie en cours : <strong>{s.company}</strong> · {money(state.balance.available)} ·{" "}
      <Link href="/carte">Reprendre sur la carte</Link> · <Link href="/immeuble">Entrer dans l&apos;immeuble</Link>
    </p>
  );
}
