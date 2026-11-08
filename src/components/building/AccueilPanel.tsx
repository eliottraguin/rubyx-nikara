import { BasePanel } from "@/components/map/BasePanel";
import { LABELS } from "@/content/recherche";
import { SearchLauncher } from "@/components/search/SearchLauncher";
import type { SearchController } from "@/components/search/useSearch";
import type { Tips } from "@/components/search/useTips";
import { buildMapViewModel } from "@/game/map/viewmodel";
import type { ApiError, GameState, RoleId } from "@/lib/api/types";

interface Props {
  state: GameState;
  busy: boolean;
  onBuy: (role: RoleId) => Promise<ApiError | null>;
  search: SearchController;
  tips: Tips;
  onOpenConversation: (conversationId: string) => void;
  onOpenCarnet: () => void;
  onOpenOrchestrateur: () => void;
}

/** Accueil et garage : lancer une recherche du bot, puis vos bots (éclaireur, trieur, rédacteur, directeur de campagne) et le coffre. */
export function AccueilPanel({ state, busy, onBuy, search, tips, onOpenConversation, onOpenCarnet, onOpenOrchestrateur }: Props) {
  const planets = buildMapViewModel(state).planets;
  return (
    <div aria-labelledby="accueil-title" role="group">
      <h2 className="h3" id="accueil-title">
        Accueil et garage
      </h2>
      <section className="card" aria-label="Orchestrateur">
        <p>
          <strong>Pour lancer une tâche, parlez à l&apos;orchestrateur.</strong> C&apos;est aussi là que vous l&apos;améliorez.
        </p>
        <button type="button" className="btn btn-primary" onClick={onOpenOrchestrateur}>
          Ouvrir l&apos;étage Orchestrateur
        </button>
      </section>
      <section className="card" aria-label="Lancer une recherche">
        <SearchLauncher planets={planets} controller={search} tips={tips} buttonLabel={LABELS.buttonBuilding} onOpenConversation={onOpenConversation} onOpenCarnet={onOpenCarnet} />
      </section>
      <BasePanel state={state} busy={busy} onBuy={onBuy} />
    </div>
  );
}
