"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorNote, Notice } from "@/components/ui";
import { ApiError, isMockMode } from "@/lib/api";
import { login, signup } from "@/lib/api/auth";
import { useGame } from "@/lib/game-context";

const MIN_PASSWORD = 8;

export function LoginScreen() {
  const router = useRouter();
  const { refresh } = useGame();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"login" | "signup" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [touched, setTouched] = useState(false);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordOk = password.length >= MIN_PASSWORD;
  const formOk = emailOk && passwordOk;

  async function submit(kind: "login" | "signup") {
    setTouched(true);
    if (!formOk || pending) return;
    setError(null);
    setPending(kind);
    try {
      const account = await (kind === "login" ? login : signup)(email.trim(), password);
      await refresh();
      router.push(kind === "login" && account.hasGame ? "/carte" : "/creer");
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("UNKNOWN", "Une erreur est survenue."));
    } finally {
      setPending(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit("login");
  }

  return (
    <div className="page narrow">
      <h1>Connexion</h1>
      {isMockMode() ? (
        <Notice tone="warn" title="Mode simulé.">
          Les comptes ne sont disponibles qu&apos;avec le serveur réel. <Link href="/creer">Créer une entreprise sans compte</Link>.
        </Notice>
      ) : null}
      <form onSubmit={onSubmit} noValidate>
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
        <p className="help">« Créer mon entreprise » ouvre votre compte avec ces identifiants, puis vous mène à la création de l&apos;entreprise.</p>
      </form>
    </div>
  );
}
