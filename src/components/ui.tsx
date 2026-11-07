"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { ApiError } from "@/lib/api";
import { RECOVERABLE } from "@/lib/format";
import { useGame } from "@/lib/game-context";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info";

/** Statut toujours en texte ; la couleur n'est qu'un renfort. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function ErrorNote({ error }: { error: ApiError | null }) {
  if (!error) return null;
  const recoverable = RECOVERABLE.includes(error.code);
  return (
    <div className="note note-bad" role="alert">
      <strong>{recoverable ? "Réessayez : " : "Action impossible : "}</strong>
      {error.message}
      <span className="code"> (code {error.code})</span>
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className={`note note-${tone}`} role="status">
      {title ? <strong>{title} </strong> : null}
      {children}
    </div>
  );
}

const DEFINITIONS = {
  prompt: "Un prompt est l'instruction que vous écrivez à un agent. Plus il est précis (quoi, pour qui, avec quelles informations), plus la réponse est utile.",
  agent: "Un agent est un assistant IA spécialisé dans un métier. Il ne connaît que ce que vous lui écrivez ou lui partagez.",
  source: "Une source est un document ou une information sur laquelle s'appuie une réponse. Vérifiez toujours d'où vient un chiffre.",
} as const;

/** Définition courte au clic (clavier : Entrée/Espace, Échap pour fermer). */
export function Term({ term, children }: { term: keyof typeof DEFINITIONS; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="term">
      <button
        type="button"
        className="term-btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        {children ?? term}
        <span className="sr-only"> (voir la définition)</span>
      </button>
      {open ? (
        <span className="term-def" role="note">
          <strong>{term}</strong> : {DEFINITIONS[term]}
        </span>
      ) : null}
    </span>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="back" href={href}>
      ← {children}
    </Link>
  );
}

/** Garde : exige une partie ; sinon explique et renvoie à l'accueil. */
export function RequireSession({ children }: { children: (s: NonNullable<ReturnType<typeof useGame>["state"]>) => ReactNode }) {
  const { state, connectionLost } = useGame();
  if (state === undefined)
    return connectionLost ? (
      <Notice tone="bad" title="Connexion perdue.">
        Impossible de lire votre partie pour l&apos;instant. Nouvel essai automatique toutes les 5 secondes.
      </Notice>
    ) : (
      <Loading label="Chargement de votre partie…" />
    );
  if (state === null)
    return (
      <div className="card">
        <h1>Aucune partie en cours</h1>
        <p>Créez une entreprise pour commencer, ou reprenez une partie existante depuis l&apos;accueil.</p>
        <Link className="btn btn-primary" href="/">
          Aller à l&apos;accueil
        </Link>
      </div>
    );
  return <>{children(state)}</>;
}
