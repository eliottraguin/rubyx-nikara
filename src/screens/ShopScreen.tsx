"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BackLink, Loading, RequireSession } from "@/components/ui";
import { InstanceList } from "@/components/shop/InstanceList";
import { ShopCatalog } from "@/components/shop/ShopCatalog";
import { createShopApiForMode, type AgentInstance, type ShopCatalog as Catalog } from "@/lib/api/shop";
import type { GameState } from "@/lib/api";
import { money } from "@/lib/format";

function Shop({ state }: { state: GameState }) {
  const api = useMemo(() => createShopApiForMode(), []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [instances, setInstances] = useState<AgentInstance[] | null>(null);

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([api.getCatalog(), api.listInstances()]);
    setCatalog(c);
    setInstances(i);
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec une source externe (API)
    void load();
  }, [load]);

  function onPurchased(instance: AgentInstance) {
    setInstances((prev) => [...(prev ?? []), instance]);
    void load();
  }
  function onRenamed(instance: AgentInstance) {
    setInstances((prev) => (prev ?? []).map((i) => (i.id === instance.id ? instance : i)));
  }

  return (
    <div className="page">
      <BackLink href="/carte">Carte</BackLink>
      <h1>Boutique</h1>
      <p>
        Solde disponible : <strong>{money(state.balance.available)}</strong>. Chaque instance s&apos;achète séparément ; le serveur vérifie
        votre solde et vos droits.
      </p>
      {catalog ? (
        <ShopCatalog catalog={catalog} balanceAvailable={state.balance.available} api={api} onPurchased={onPurchased} />
      ) : (
        <Loading label="Chargement du catalogue…" />
      )}
      <h2 className="h3">Vos agents</h2>
      {instances ? <InstanceList instances={instances} api={api} onRenamed={onRenamed} /> : <Loading label="Chargement de vos agents…" />}
    </div>
  );
}

export function ShopScreen() {
  return <RequireSession>{(s) => <Shop state={s} />}</RequireSession>;
}
