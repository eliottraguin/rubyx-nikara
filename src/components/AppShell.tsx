"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ShortcutsMenu } from "@/components/building/ShortcutsMenu";
import { isMockMode } from "@/lib/api";
import { money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

function useMotionPref() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("motion-off") === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture d'une préférence navigateur au montage
      setOff(v);
      document.documentElement.dataset.motion = v ? "off" : "on";
    } catch {
      /* préférence non persistée */
    }
  }, []);
  const toggle = () => {
    setOff((o) => {
      const n = !o;
      document.documentElement.dataset.motion = n ? "off" : "on";
      try {
        window.localStorage.setItem("motion-off", n ? "1" : "0");
      } catch {
        /* ignoré */
      }
      return n;
    });
  };
  return [off, toggle] as const;
}

/** La carte est l'entrée principale ; la boutique d'agents est un écran secondaire. */
const SECONDARY = [{ href: "/boutique", label: "Boutique" }];
const SECONDARY_PREFIXES = ["/boutique"];

export function AppShell({ children }: { children: ReactNode }) {
  const { state, connectionLost, refresh } = useGame();
  const path = usePathname();
  const [motionOff, toggleMotion] = useMotionPref();
  const session = state?.session;
  const onMap = path === "/carte";
  const onSecondary = SECONDARY_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  return (
    <>
      <a className="skip" href="#contenu">
        Aller au contenu
      </a>
      <header className="topbar">
        <div className="topbar-in">
          <Link href={session ? "/carte" : "/"} className="brand">
            Prospect Tycoon
          </Link>
          {session ? (
            <nav aria-label="Navigation principale">
              <ul className="nav">
                <li>
                  <Link href="/carte" className="nav-main" aria-current={onMap ? "page" : undefined}>
                    Carte
                  </Link>
                </li>
                <li>
                  <Link href="/fiche" className="nav-main" aria-current={path === "/fiche" ? "page" : undefined}>
                    Ma fiche
                  </Link>
                </li>
                <li>
                  <ShortcutsMenu path={path} />
                </li>
                <li>
                  {/* `key` : le menu se referme après chaque navigation. */}
                  <details className="nav-more" key={path}>
                    <summary className={onSecondary ? "nav-more-on" : undefined}>Autres écrans</summary>
                    <ul className="nav-more-list">
                      {SECONDARY.map((n) => (
                        <li key={n.href}>
                          <Link href={n.href} aria-current={path === n.href ? "page" : undefined}>
                            {n.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              </ul>
            </nav>
          ) : null}
          <div className="topbar-right">
            {state?.simulated_provider || isMockMode() ? (
              <span className="badge-sim" title="Les réponses des agents sont simulées">
                Mode simulé
              </span>
            ) : null}
            {state ? (
              <p className="treasury" aria-label="Trésorerie">
                <span className="treasury-label">Solde disponible</span>{" "}
                <strong>{money(state.balance.available)}</strong>
                {state.balance.reserved > 0 ? (
                  <span className="treasury-res"> ({money(state.balance.reserved)} réservés)</span>
                ) : null}
              </p>
            ) : null}
            <label className="motion">
              <input type="checkbox" checked={motionOff} onChange={toggleMotion} /> Réduire les animations
            </label>
          </div>
        </div>
      </header>
      {connectionLost ? (
        <div className="note note-bad banner" role="alert">
          <strong>Connexion perdue.</strong> Vos données sont conservées côté serveur. Nouvel essai automatique en cours.{" "}
          <button type="button" className="btn btn-small" onClick={() => void refresh()}>
            Réessayer maintenant
          </button>
        </div>
      ) : null}
      {session && onSecondary ? (
        <div className="mapbar">
          <Link href="/carte" className="mapbar-link">
            ← Retour à la carte
          </Link>
          <span className="muted">La carte est le centre du jeu ; cet écran est secondaire.</span>
        </div>
      ) : null}
      <main id="contenu" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
