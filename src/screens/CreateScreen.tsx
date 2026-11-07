"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorNote, Notice, Term } from "@/components/ui";
import type { ApiError, Mode } from "@/lib/api";
import { useGame } from "@/lib/game-context";

const MODES: { id: Mode; title: string; text: string }[] = [
  { id: "beginner", title: "Débutant", text: "Petite entreprise de services numériques. Tutoriel une action à la fois et indices." },
  { id: "expert", title: "Expert", text: "Agence de communication. Briefs ouverts, autonomie, aide facultative." },
];

export function CreateScreen() {
  const router = useRouter();
  const { state, mutate, busy } = useGame();
  const [company, setCompany] = useState("");
  const [mode, setMode] = useState<Mode>("beginner");
  const [error, setError] = useState<ApiError | null>(null);
  const existing = state?.session;
  const [confirmReplace, setConfirmReplace] = useState(false);
  const nameOk = company.trim().length >= 2;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nameOk) return;
    if (existing && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setError(null);
    const r = await mutate((api) => api.createSession({ company: company.trim(), mode }));
    if (r.ok) router.push("/carte");
    else setError(r.error);
  }

  return (
    <div className="page narrow">
      <h1>Créer votre entreprise</h1>
      {existing ? (
        <Notice tone="warn" title="Une partie existe déjà.">
          <Link href="/carte">Reprendre « {existing.company} » sur la carte</Link> ou en créer une nouvelle (l&apos;ancienne sera remplacée
          après confirmation).
        </Notice>
      ) : null}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="company">Nom de l&apos;entreprise</label>
          <input
            id="company"
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={60}
            autoComplete="off"
            aria-describedby="company-help"
            required
          />
          <p id="company-help" className="help">
            2 à 60 caractères. Vous la retrouverez sur la carte, au centre du jeu.
          </p>
        </div>

        <fieldset className="field">
          <legend>Mode de jeu</legend>
          <div className="grid2">
            {MODES.map((m) => (
              <label key={m.id} className={`choice ${mode === m.id ? "choice-on" : ""}`}>
                <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span>
                  <strong>{m.title}</strong>
                  <span className="help block">{m.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="card">
          <h2>Votre point de départ</h2>
          <p>
            Vous démarrez avec un capital de jeu et un <Term term="agent">agent</Term> rédacteur. Chaque
            agent répond à vos <Term term="prompt">prompts</Term> (en nombre limité par commande). Le montant exact et les
            limites sont fixés par le serveur et affichés dès la création.
          </p>
        </div>

        {confirmReplace ? (
          <Notice tone="warn" title="Remplacer la partie existante ?">
            Votre partie « {existing?.company} » sera supprimée.
          </Notice>
        ) : null}
        <ErrorNote error={error} />
        {!nameOk && company.length > 0 ? <p className="help" role="status">Le nom doit comporter au moins 2 caractères.</p> : null}
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={!nameOk || busy}>
            {busy ? "Création…" : confirmReplace ? "Oui, remplacer et créer" : "Créer mon entreprise"}
          </button>
          <Link className="btn" href="/">
            Retour
          </Link>
        </div>
      </form>
    </div>
  );
}
