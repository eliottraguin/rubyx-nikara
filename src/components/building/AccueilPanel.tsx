import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import type { AssistantController } from "@/components/assistant/useAssistant";
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
  assistant: AssistantController;
  tips: Tips;
  onOpenConversation: (conversationId: string) => void;
  onOpenCarnet: () => void;
}

/** Accueil et garage : lancer une recherche du bot, puis vos bots (éclaireur, trieur, rédacteur, directeur de campagne) et le coffre. */
export function AccueilPanel({ state, busy, onBuy, search, assistant, tips, onOpenConversation, onOpenCarnet }: Props) {
  const planets = buildMapViewModel(state).planets;
  return (
    <div aria-labelledby="accueil-title" role="group">
      <h2 className="h3" id="accueil-title">
        Accueil et garage
      </h2>
      <section className="card" aria-label="Vos assistants">
        <AssistantPanel controller={assistant} />
      </section>
      <section className="card" aria-label="Lancer une recherche">
        <SearchLauncher planets={planets} controller={search} tips={tips} buttonLabel={LABELS.buttonBuilding} onOpenConversation={onOpenConversation} onOpenCarnet={onOpenCarnet} />
      </section>
      <BasePanel state={state} busy={busy} onBuy={onBuy} />
    </div>
  );
}
