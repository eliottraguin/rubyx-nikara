"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CityBackdrop, type CityBackdropHandle } from "@/components/login/CityBackdrop";
import { ErrorNote, Notice } from "@/components/ui";
import { ApiError, isMockMode } from "@/lib/api";
import { login, signup } from "@/lib/api/auth";
import { money } from "@/lib/format";
import { useGame } from "@/lib/game-context";

const MIN_PASSWORD = 8;
/** Largeur du formulaire (px) : la ville est décalée à droite quand l'écran est assez large. */
const CARD_PX = 480;
/** Le zoom ne doit jamais retenir la navigation au-delà de ce délai (ms). */
const DIVE_MAX_MS = 2400;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function LoginScreen() {
  const router = useRouter();
  const { refresh, state } = useGame();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const backdrop = useRef<CityBackdropHandle>(null);
  const [pending, setPending] = useState<"login" | "signup" | "resume" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [touched, setTouched] = useState(false);
  const [inset, setInset] = useState(0);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordOk = password.length >= MIN_PASSWORD;
  const formOk = emailOk && passwordOk;
  const session = state?.session;

  useEffect(() => {
    const on = () => setInset(window.innerWidth >= 1000 ? CARD_PX : 0);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  /** Plonge vers l'immeuble puis navigue ; la plongée ne retient jamais la navigation. */
  async function goTo(href: string) {
    await Promise.race([backdrop.current?.dive().catch(() => undefined), wait(DIVE_MAX_MS)]);
    router.push(href);
  }

  async function submit(kind: "login" | "signup") {
    setTouched(true);
    if (!formOk || pending) return;
    setError(null);
    setPending(kind);
    try {
      const account = await (kind === "login" ? login : signup)(email.trim(), password);
      await refresh();
      await goTo(kind === "login" && account.hasGame ? "/carte" : "/creer");
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Une erreur est survenue."));
    } finally {
      setPending(null);
    }
  }

  async function resume() {
    if (pending) return;
    setPending("resume");
    try {
      await goTo("/carte");
    } finally {
      setPending(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit("login");
  }

  return (
    <div className="login-page">
      <CityBackdrop ref={backdrop} insetLeft={inset} />
      <div className="card login-card">
        <p className="login-eyebrow">Prospect Tycoon</p>
        <h1>Trouvez de vrais clients avec des agents IA.</h1>
        <p className="lead">Décrivez votre entreprise et votre cible : un bot cherche des clients pour vous, vous gardez les meilleurs prospects dans votre carnet.</p>

        {session ? (
          <div className="login-resume">
            <p>
              Partie en cours : <strong>{session.company}</strong>
              {state ? <> · {money(state.balance.available)}</> : null}
            </p>
            <button type="button" className="btn btn-primary" disabled={pending !== null} onClick={() => void resume()}>
              {pending === "resume" ? "Ouverture…" : "Reprendre sur la carte"}
            </button>
          </div>
        ) : null}

        {isMockMode() ? (
          <Notice tone="warn" title="Mode simulé.">
            Les comptes ne sont disponibles qu&apos;avec le serveur réel.{" "}
            <Link href="/creer">Créer une entreprise sans compte</Link>.
          </Notice>
        ) : null}

        <form onSubmit={onSubmit} noValidate aria-label="Connexion">
          <h2 className="login-h2">Connexion</h2>
          <div className="field">
            <label htmlFor="email">Adresse email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={320}
              aria-invalid={touched && !emailOk}
              aria-describedby={touched && !emailOk ? "email-err" : undefined}
              required
            />
            {touched && !emailOk ? (
              <p id="email-err" className="help" role="alert">
                Saisissez une adresse email valide.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-invalid={touched && !passwordOk}
              aria-describedby="password-help"
              required
            />
            <p id="password-help" className={touched && !passwordOk ? "help note-bad" : "help"} role={touched && !passwordOk ? "alert" : undefined}>
              {MIN_PASSWORD} caractères minimum.
            </p>
          </div>
          <ErrorNote error={error} />
          <p className="actions">
            <button type="submit" className="btn btn-primary" disabled={pending !== null}>
              {pending === "login" ? "Connexion…" : "Se connecter"}
            </button>{" "}
            <button type="button" className="btn" disabled={pending !== null} onClick={() => void submit("signup")}>
              {pending === "signup" ? "Création du compte…" : "Créer mon entreprise"}
            </button>
          </p>
          <p className="help">
            « Créer mon entreprise » ouvre votre compte avec ces identifiants, puis vous mène à la création de l&apos;entreprise.{" "}
            <Link href="/creer">Essayer sans compte</Link>.
          </p>
        </form>
      </div>
    </div>
  );
}
