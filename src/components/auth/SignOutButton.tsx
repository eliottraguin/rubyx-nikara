"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { isMockMode, ApiError } from "@/lib/api";
import { logout, type Account } from "@/lib/api/auth";
import type { ApiClient, SessionInfo } from "@/lib/api/types";

/** Le dézoom de la carte (bus.farewell) ne doit jamais retenir la déconnexion au-delà de ce délai. */
const FAREWELL_MAX_MS = 2500;

export interface SignOutButtonProps {
  /** undefined = chargement initial ; null = aucun compte. */
  account: Account | null | undefined;
  /** undefined = chargement initial ; null = aucune partie. */
  session: SessionInfo | null | undefined;
  api: ApiClient | null;
  /** Posée par la vue carte pendant son montage ; `null` ailleurs pour une navigation immédiate. */
  farewellRef: { current: (() => Promise<void>) | null };
  /** Purge l'état du contexte de jeu (session + compte) avant la navigation vers l'accueil. */
  onDone: () => void;
}

/**
 * Bouton de déconnexion unique, affiché dans l'en-tête sur toutes les pages. Compte connecté : « Se déconnecter »
 * (POST /api/auth/logout). Partie sans compte : « Quitter la partie », destructrice (DELETE /api/session, aucun
 * autre moyen de la reprendre) donc confirmée en deux étapes.
 */
export function SignOutButton({ account, session, api, farewellRef, onDone }: SignOutButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const ready = account !== undefined && session !== undefined;
  const hasAccount = !!account;
  const hasSession = !!session;

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        const zoom = farewellRef.current?.().catch(() => undefined) ?? Promise.resolve();
        const timeout = new Promise<void>((r) => setTimeout(r, FAREWELL_MAX_MS));
        await Promise.all([action(), Promise.race([zoom, timeout])]);
        onDone();
        router.push("/");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "La déconnexion a échoué.");
      } finally {
        setBusy(false);
      }
    },
    [farewellRef, onDone, router],
  );

  if (isMockMode() || !ready || (!hasAccount && !hasSession)) return null;

  return (
    <span className="signout">
      {error ? (
        <span className="note note-bad" role="alert">
          {error}
        </span>
      ) : null}
      {hasAccount ? (
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run(logout)}>
          {busy ? "Déconnexion…" : "Se déconnecter"}
        </button>
      ) : confirming ? (
        <span role="alertdialog" aria-label="Confirmer la sortie">
          Quitter sans compte supprime définitivement cette partie.{" "}
          <button
            type="button"
            className="btn btn-small btn-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!api) throw new ApiError("UNKNOWN", "Interface en cours de chargement.");
                await api.deleteSession();
              })
            }
          >
            {busy ? "Sortie…" : "Oui, quitter"}
          </button>{" "}
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => setConfirming(false)}>
            Annuler
          </button>
        </span>
      ) : (
        <button type="button" className="btn btn-small" disabled={!api} onClick={() => setConfirming(true)}>
          Quitter la partie
        </button>
      )}
    </span>
  );
}
