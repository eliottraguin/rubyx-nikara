"use client";

import { useState } from "react";

/** Copie un texte brut dans le presse-papiers (aucune mise en forme, aucun HTML). */
export function CopyButton({ text, label = "Copier", what }: { text: string; label?: string; what?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "ko">("idle");
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("ko");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <span className="copy">
      <button type="button" className="btn btn-small" onClick={onClick} aria-label={what ? `${label} : ${what}` : label}>
        {label}
      </button>{" "}
      <span className="help" role="status" aria-live="polite">
        {state === "ok" ? "Copié." : state === "ko" ? "Copie impossible : sélectionnez le texte à la main." : ""}
      </span>
    </span>
  );
}
