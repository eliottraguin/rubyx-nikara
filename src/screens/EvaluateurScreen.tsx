"use client";

import { BackLink, RequireSession } from "@/components/ui";

/** Écran minimal : le contenu (notes, conseils pédagogiques) viendra de GR3-68. */
function Evaluateur() {
  return (
    <div className="page">
      <BackLink href="/carte">Carte</BackLink>
      <h1>Évaluateur</h1>
      <p>Cet écran arrive bientôt : il notera vos prompts et vos échanges avec les clients.</p>
    </div>
  );
}

export function EvaluateurScreen() {
  return <RequireSession>{() => <Evaluateur />}</RequireSession>;
}
