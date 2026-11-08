"use client";

import { useState } from "react";
import { shopErrorMessage, ShopError, type AgentInstance, type ShopApi, type ShopCatalog as Catalog, type ShopItem } from "@/lib/api/shop";
import type { RoleId } from "@/lib/api/types";
import { money, ROLE_LABEL } from "@/lib/format";
import { Notice } from "@/components/ui";
import s from "./shop.module.css";

const ROLE_COLOR: Record<RoleId, string> = { scout: "#0b5c63", triage: "#1d4f91", replier: "#7c4a00", ads: "#6b2d8f" };

function why(item: ShopItem, balanceAvailable: number): string | null {
  if (!item.unlocked) return item.unlockClients ? `Débloqué à ${item.unlockClients} client${item.unlockClients > 1 ? "s" : ""}.` : "Verrouillé.";
  if (!item.buyable) return "Métier pas encore débloqué ou limite d'exemplaires atteinte.";
  if (item.price > balanceAvailable) return `Solde insuffisant (manque ${money(item.price - balanceAvailable)}).`;
  return null;
}

function ItemCard({
  item,
  balanceAvailable,
  busy,
  onBuy,
}: {
  item: ShopItem;
  balanceAvailable: number;
  busy: boolean;
  onBuy: (item: ShopItem) => void;
}) {
  const [pending, setPending] = useState(false);
  const blocker = why(item, balanceAvailable);
  return (
    <li className={`${s.itemCard} ${blocker ? s.locked : ""}`}>
      <div className={s.cardHead}>
        <span className={s.avatar} style={{ background: ROLE_COLOR[item.role] }} aria-hidden="true">
          {ROLE_LABEL[item.role].charAt(0)}
        </span>
        <span className={s.cardTitle}>
          <strong>{item.label}</strong>
          <span>
            {ROLE_LABEL[item.role]} · palier {item.tier}
          </span>
        </span>
      </div>
      <div className={s.stats}>
        {item.effects.durationMultiplier < 1 ? <span className={s.stat}>Rapide ×{item.effects.durationMultiplier}</span> : null}
        {item.effects.qualityBonus > 0 ? <span className={s.stat}>+{item.effects.qualityBonus} qualité</span> : null}
        {!item.unlocked && item.unlockClients ? (
          <span className={s.stat}>
            Dès {item.unlockClients} client{item.unlockClients > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      <p className={s.price}>{money(item.price)}</p>
      {pending ? (
        <div className={s.confirm} role="group" aria-label={`Confirmer l'achat de ${item.label}`}>
          <p>Acheter {item.label} ?</p>
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={busy}
            onClick={() => {
              setPending(false);
              onBuy(item);
            }}
          >
            Confirmer
          </button>{" "}
          <button type="button" className="btn btn-small" onClick={() => setPending(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!blocker || busy}
            aria-describedby={blocker ? `why-${item.id}` : undefined}
            onClick={() => setPending(true)}
          >
            Acheter
          </button>
          {blocker ? (
            <p id={`why-${item.id}`} className="help">
              {blocker}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

export function ShopCatalog({
  catalog,
  balanceAvailable,
  api,
  onPurchased,
}: {
  catalog: Catalog;
  balanceAvailable: number;
  api: ShopApi;
  onPurchased: (instance: AgentInstance) => void;
}) {
  const [role, setRole] = useState<RoleId | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const roles: RoleId[] = ["scout", "triage", "replier", "ads"];
  const items = catalog.items.filter((it) => role === "all" || it.role === role);

  async function buy(item: ShopItem) {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const instance = await api.purchase(item.id);
      setDone(`${item.label} rejoint votre équipe.`);
      onPurchased(instance);
    } catch (e) {
      setError(e instanceof ShopError ? shopErrorMessage(e) : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Catalogue">
      <div className={s.tabs} role="group" aria-label="Filtrer par métier">
        <button type="button" className={s.tab} aria-pressed={role === "all"} onClick={() => setRole("all")}>
          Tous
        </button>
        {roles.map((r) => (
          <button key={r} type="button" className={s.tab} aria-pressed={role === r} onClick={() => setRole(r)}>
            {ROLE_LABEL[r]} ({catalog.ownedCounts[r]})
          </button>
        ))}
      </div>
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <ul className={s.grid}>
        {items.map((it) => (
          <ItemCard key={it.id} item={it} balanceAvailable={balanceAvailable} busy={busy} onBuy={buy} />
        ))}
      </ul>
    </section>
  );
}
