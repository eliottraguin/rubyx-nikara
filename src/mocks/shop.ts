/**
 * Boutique et instances d'agents simulées (hors `NEXT_PUBLIC_API_MODE=http`), tant que le ticket backend C2
 * (GR3-54) n'est pas fusionné dans `integration/v2`. Catalogue lu dans `data/shop/*.json` (livré par B1, GR3-49) :
 * mêmes identifiants et noms de champs que le contrat (docs/CONTRACTS-V2.md §2 et §12), pour une bascule sans
 * changement de forme une fois l'API réelle branchée. État en mémoire seulement (pas de persistance entre sessions).
 */
import type { AgentConfig, AgentInstance, ShopApi, ShopCatalog, ShopItem } from "@/lib/api/shop";
import { ShopError } from "@/lib/api/shop";
import type { RoleId } from "@/lib/api/types";
import { AGENTS, PLACES } from "./fixtures";
import { retainedCount } from "./searches";

import adsCatalog from "../../data/shop/ads.json";
import replierCatalog from "../../data/shop/replier.json";
import scoutCatalog from "../../data/shop/scout.json";
import triageCatalog from "../../data/shop/triage.json";

interface WireItem {
  id: string;
  tier: number;
  label: string;
  price: number;
  effects: { duration_multiplier: number; quality_bonus: number };
  unlock_clients: number | null;
}
const WIRE: { role: RoleId; items: WireItem[] }[] = [
  scoutCatalog as { role: RoleId; items: WireItem[] },
  triageCatalog as { role: RoleId; items: WireItem[] },
  replierCatalog as { role: RoleId; items: WireItem[] },
  adsCatalog as { role: RoleId; items: WireItem[] },
];

/** `rules_v2.agents_max_instances_per_role`, proposé **3** (docs/CONTRACTS-V2.md §2) : à relire sur le serveur réel. */
const MAX_INSTANCES_PER_ROLE = 3;
const UNLOCK_AT = 3;
/**
 * Solde de démonstration propre à cette maquette (le solde réel vient toujours de `GET /api/state`, hors
 * périmètre de ce ticket : `INITIAL_BALANCE` de `./fixtures` ne couvre même pas un seul article de palier 1).
 */
const DEMO_BALANCE = 200;

let balance = DEMO_BALANCE;
let instances: AgentInstance[] = [];
let seq = 0;

export function resetMockShop(startBalance = DEMO_BALANCE) {
  balance = startBalance;
  instances = [];
  seq = 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date(Date.UTC(2026, 10, 8, 10, 0, seq)).toISOString();

/** Même règle de déblocage que le hangar (clients obtenus) ; maquette uniquement, le serveur fait foi. */
const clientsNow = () => PLACES.filter((p) => retainedCount(p.id) >= UNLOCK_AT).length;
const roleUnlockClients = (role: RoleId): number | null => AGENTS.find((a) => a.role === role)?.unlock_clients ?? null;
const roleUnlocked = (role: RoleId): boolean => {
  const n = roleUnlockClients(role);
  return n === null || clientsNow() >= n;
};
const ownedCount = (role: RoleId): number => instances.filter((i) => i.role === role).length;

function defaultInstructions(role: RoleId, tier: number): string {
  const BASE: Record<RoleId, string> = {
    scout: "Cherche des prospects vérifiables correspondant à la fiche entreprise et cible, sans jamais inventer de source.",
    triage: "Résume les messages reçus des prospects du carnet, sans révéler d'adresse ni de numéro.",
    replier: "Rédige des brouillons de réponse clairs et professionnels, que le joueur relit avant tout envoi.",
    ads: "Prépare des contenus de pub prêts à publier, dans les limites de chaque format, sans rien publier.",
  };
  return tier > 1 ? `${BASE[role]} (palier ${tier} : plus rapide, meilleure qualité.)` : BASE[role];
}

function catalog(): ShopCatalog {
  const items: ShopItem[] = WIRE.flatMap(({ role, items: list }) =>
    list.map((it) => {
      const itemUnlocked = it.unlock_clients === null || clientsNow() >= it.unlock_clients;
      return {
        id: it.id,
        role,
        tier: it.tier,
        label: it.label,
        price: it.price,
        effects: { durationMultiplier: it.effects.duration_multiplier, qualityBonus: it.effects.quality_bonus },
        unlockClients: it.unlock_clients,
        unlocked: itemUnlocked,
        buyable: itemUnlocked && roleUnlocked(role) && ownedCount(role) < MAX_INSTANCES_PER_ROLE,
      };
    }),
  );
  const ownedCounts = Object.fromEntries((["scout", "triage", "replier", "ads"] as RoleId[]).map((r) => [r, ownedCount(r)])) as Record<RoleId, number>;
  return { items, ownedCounts };
}

export function createMockShopApi(opts: { delayMs?: number } = {}): ShopApi {
  const delay = opts.delayMs ?? 250;
  return {
    async getCatalog() {
      await sleep(delay);
      return catalog();
    },
    async listInstances() {
      await sleep(delay);
      return [...instances];
    },
    async purchase(itemId) {
      await sleep(delay);
      const found = WIRE.flatMap(({ role, items: list }) => list.map((it) => ({ role, it }))).find((x) => x.it.id === itemId);
      if (!found) throw new ShopError("NOT_FOUND", "Cet article n'existe plus.", 404);
      const { role, it } = found;
      const itemUnlocked = it.unlock_clients === null || clientsNow() >= it.unlock_clients;
      if (!itemUnlocked || !roleUnlocked(role)) throw new ShopError("ROLE_LOCKED", "Ce métier n'est pas encore débloqué.", 409);
      if (ownedCount(role) >= MAX_INSTANCES_PER_ROLE) throw new ShopError("INSTANCE_LIMIT", "Vous possédez déjà le nombre maximal d'exemplaires pour ce métier.", 409);
      if (it.price > balance) throw new ShopError("INSUFFICIENT_FUNDS", "Solde insuffisant pour cet achat. Rien n'a été débité.", 409);
      balance -= it.price;
      seq++;
      const config: AgentConfig = { version: 1, instructions: defaultInstructions(role, it.tier), contextNote: null, tools: [], tierCap: it.tier };
      const instance: AgentInstance = { id: `agi_mock_${seq}`, role, tier: it.tier, status: "idle", label: null, config, pricePaid: it.price, purchasedAt: stamp() };
      instances.push(instance);
      return instance;
    },
    async rename(instanceId, label) {
      await sleep(Math.min(delay, 150));
      const i = instances.find((x) => x.id === instanceId);
      if (!i) throw new ShopError("NOT_FOUND", "Cette instance n'existe plus.", 404);
      const trimmed = label.trim().slice(0, 40);
      const updated: AgentInstance = { ...i, label: trimmed || null };
      instances = instances.map((x) => (x.id === instanceId ? updated : x));
      return updated;
    },
  };
}
