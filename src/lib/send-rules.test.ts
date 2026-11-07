import { describe, expect, it } from "vitest";
import type { AttemptView, Balance, RoleQuota } from "@/lib/api";
import { checkSend } from "./send-rules";

const attempt = { status: "ACTIVE" } as AttemptView;
const quota = (o: Partial<RoleQuota> = {}): RoleQuota => ({ role: "scout", owned: true, used: 0, limit: 5, next_cost_max: 2, ...o });
const bal = (available: number): Balance => ({ booked: available, reserved: 0, available });

describe("checkSend", () => {
  it("autorise un envoi valide", () => {
    const r = checkSend({ attempt, quota: quota(), role: "scout", balance: bal(10), text: "Bonjour" });
    expect(r.allowed).toBe(true);
  });

  it("bloque sans fonds et affiche la cause en texte", () => {
    const r = checkSend({ attempt, quota: quota({ next_cost_max: 3 }), role: "scout", balance: bal(1), text: "Bonjour" });
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/Fonds insuffisants.*3\s\$.*1\s\$/);
  });

  it("bloque au 5e message déjà utilisé", () => {
    const r = checkSend({ attempt, quota: quota({ used: 5 }), role: "scout", balance: bal(10), text: "Encore" });
    expect(r.allowed).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/5 messages/);
  });

  it("bloque un agent verrouillé", () => {
    const r = checkSend({ attempt, quota: quota({ owned: false }), role: "scout", balance: bal(10), text: "x" });
    expect(r.reasons.join(" ")).toMatch(/verrouillé/);
  });

  it("un message gratuit exceptionnel ne demande pas de fonds", () => {
    const r = checkSend({ attempt, quota: quota({ next_cost_max: 5, free_credit: 1 }), role: "scout", balance: bal(0), text: "x" });
    expect(r.allowed).toBe(true);
  });
});
