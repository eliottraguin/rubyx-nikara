import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, SessionInfo } from "@/lib/api/types";
import { SignOutButton } from "./SignOutButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const logoutMock = vi.fn(async () => undefined);
vi.mock("@/lib/api/auth", () => ({ logout: () => logoutMock() }));

const session: SessionInfo = { id: "s1", mode: "beginner", company: "Atelier", rules_version: "v1" };
const account = { userId: "u1", email: "joueur@example.com", hasGame: true };

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  return {
    mode: "http",
    createSession: vi.fn(),
    getState: vi.fn(),
    getAction: vi.fn(),
    purchaseAgent: vi.fn(),
    deleteSession: vi.fn(async () => undefined),
    ...over,
  } as unknown as ApiClient;
}

describe("SignOutButton", () => {
  beforeEach(() => {
    push.mockClear();
    logoutMock.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("ne s'affiche ni sans compte ni sans partie, ni pendant le chargement", () => {
    const { rerender } = render(
      <SignOutButton account={undefined} session={undefined} api={fakeApi()} farewellRef={{ current: null }} onDone={vi.fn()} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<SignOutButton account={null} session={null} api={fakeApi()} farewellRef={{ current: null }} onDone={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("compte connecté : « Se déconnecter » appelle logout, purge et renvoie à l'accueil", async () => {
    const onDone = vi.fn();
    render(<SignOutButton account={account} session={session} api={fakeApi()} farewellRef={{ current: null }} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("partie sans compte : « Quitter la partie » demande confirmation avant de supprimer la partie", async () => {
    const onDone = vi.fn();
    const api = fakeApi();
    render(<SignOutButton account={null} session={session} api={api} farewellRef={{ current: null }} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitter la partie" }));
    expect(api.deleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Oui, quitter" }));
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("« Annuler » referme la confirmation sans rien supprimer", () => {
    const api = fakeApi();
    render(<SignOutButton account={null} session={session} api={api} farewellRef={{ current: null }} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitter la partie" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.deleteSession).not.toHaveBeenCalled();
  });

  it("joue le dézoom (farewell) avant de naviguer, plafonné, sans bloquer si la promesse ne se résout jamais", async () => {
    const onDone = vi.fn();
    const farewellRef = { current: () => new Promise<void>(() => {}) }; // ne se résout jamais
    vi.useFakeTimers();
    render(<SignOutButton account={account} session={session} api={fakeApi()} farewellRef={farewellRef} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await vi.advanceTimersByTimeAsync(2500);
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("mode simulé : ne s'affiche jamais", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
    render(<SignOutButton account={account} session={session} api={fakeApi()} farewellRef={{ current: null }} onDone={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
