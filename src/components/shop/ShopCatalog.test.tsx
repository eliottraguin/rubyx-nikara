import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShopError, type AgentInstance, type ShopApi, type ShopCatalog as Catalog, type ShopItem } from "@/lib/api/shop";
import { ShopCatalog } from "./ShopCatalog";

const item = (over: Partial<ShopItem> = {}): ShopItem => ({
  id: "scout_t1", role: "scout", tier: 1, label: "Éclaireur", price: 40,
  effects: { durationMultiplier: 1, qualityBonus: 0 }, unlockClients: null, unlocked: true, buyable: true, ...over,
});
const catalog = (items: ShopItem[]): Catalog => ({ items, ownedCounts: { scout: 0, triage: 0, replier: 0, ads: 0 } });
const instance = (over: Partial<AgentInstance> = {}): AgentInstance => ({
  id: "agi_1", role: "scout", tier: 1, status: "idle", label: null, pricePaid: 40, purchasedAt: "2026-11-08T10:00:00Z",
  config: { version: 1, instructions: "x", contextNote: null, tools: [], tierCap: 1 }, ...over,
});

function fakeApi(purchase: ShopApi["purchase"]): ShopApi {
  return { getCatalog: vi.fn(), listInstances: vi.fn(), purchase, rename: vi.fn() };
}

describe("ShopCatalog", () => {
  it("demande confirmation avant l'achat, puis notifie le parent une fois acheté", async () => {
    const purchase = vi.fn(async () => instance());
    const onPurchased = vi.fn();
    render(<ShopCatalog catalog={catalog([item()])} balanceAvailable={100} api={fakeApi(purchase)} onPurchased={onPurchased} />);

    fireEvent.click(screen.getByRole("button", { name: "Acheter" }));
    expect(purchase).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmer" }));

    expect(purchase).toHaveBeenCalledWith("scout_t1");
    await screen.findByText(/rejoint votre équipe/);
    expect(onPurchased).toHaveBeenCalledWith(instance());
  });

  it("affiche un article verrouillé sans bouton actif, avec la raison", () => {
    render(
      <ShopCatalog
        catalog={catalog([item({ id: "triage_t1", role: "triage", unlocked: false, buyable: false, unlockClients: 1 })])}
        balanceAvailable={100}
        api={fakeApi(vi.fn())}
        onPurchased={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Acheter" })).toBeDisabled();
    expect(screen.getByText(/Débloqué à 1 client/)).toBeInTheDocument();
  });

  it("affiche l'erreur serveur sans débiter visuellement en cas d'échec", async () => {
    const purchase = vi.fn(async () => {
      throw new ShopError("INSUFFICIENT_FUNDS", "Solde insuffisant pour cet achat. Rien n'a été débité.", 409);
    });
    render(<ShopCatalog catalog={catalog([item()])} balanceAvailable={100} api={fakeApi(purchase)} onPurchased={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Acheter" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmer" }));

    expect(await screen.findByText(/Solde insuffisant pour cet achat/)).toBeInTheDocument();
  });
});
