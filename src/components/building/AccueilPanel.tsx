import { BasePanel } from "@/components/map/BasePanel";
import type { ApiError, GameState, RoleId } from "@/lib/api/types";

/** Accueil et garage : agents du hangar (éclaireur, trieur, rédacteur de réponse, directeur de campagne) et coffre. */
export function AccueilPanel({ state, busy, onBuy }: { state: GameState; busy: boolean; onBuy: (role: RoleId) => Promise<ApiError | null> }) {
  return (
    <div aria-labelledby="accueil-title" role="group">
      <h2 className="h3" id="accueil-title">
        Accueil et garage
      </h2>
      <BasePanel state={state} busy={busy} onBuy={onBuy} />
    </div>
  );
}
