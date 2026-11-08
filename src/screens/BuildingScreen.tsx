"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { BuildingView } from "@/components/building/BuildingView";
import { RequireSession } from "@/components/ui";
import { floorFromSlug, type Floor } from "@/game/building/floors";
import type { ApiError, RoleId } from "@/lib/api/types";
import { useGame } from "@/lib/game-context";

function Building({ slug, conversation }: { slug: string | null; conversation: string | null }) {
  const router = useRouter();
  const { mutate, busy, state, refresh } = useGame();
  const buy = useCallback(
    async (role: RoleId): Promise<ApiError | null> => {
      const r = await mutate((a) => a.purchaseAgent(role));
      return r.ok ? null : r.error;
    },
    [mutate],
  );
  const onFloorChange = useCallback((f: Floor | null) => {
    try {
      const url = new URL(window.location.href);
      if (f) url.searchParams.set("etage", f.slug);
      else url.searchParams.delete("etage");
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch {
      /* URL non modifiable : ignoré */
    }
  }, []);
  if (!state) return null;
  return <BuildingView state={state} busy={busy} initialFloor={floorFromSlug(slug)?.id ?? null} initialConversationId={conversation} onSearchDone={() => void refresh()} onBuy={buy} onLeave={() => router.push("/carte")} onFloorChange={onFloorChange} />;
}

export function BuildingScreen({ floor, conversation = null }: { floor: string | null; conversation?: string | null }) {
  return <RequireSession>{() => <Building slug={floor} conversation={conversation} />}</RequireSession>;
}
