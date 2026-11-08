"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CARNET_HREF, LABELS, MESSAGES } from "@/content/recherche";
import type { SearchProspect, SearchResult, SearchesApi } from "@/lib/api/searches";
import { PertinenceBadge } from "./PertinenceBadge";
import { contactProblem } from "./problems";

interface Props {
  result: SearchResult;
  api: SearchesApi;
  onOpenConversation: (conversationId: string) => void;
  /** Ouvre le carnet sans changer de page (dans l'immeuble) ; sinon un lien. */
  onOpenCarnet?: () => void;
  /** Placé entre le bilan et la liste (bulles d'aide). */
  children?: ReactNode;
}

/** Bilan d'une recherche : prospects ajoutés (étiquette de pertinence et citation de la source), carnet, « Contacter ». Texte seul. */
export function SearchResultList({ result, api, onOpenConversation, onOpenCarnet, children }: Props) {
  const [contacting, setContacting] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});

  async function contact(p: SearchProspect) {
    if (contacting) return;
    setContacting(p.id);
    setProblems((cur) => {
      const next = { ...cur };
      delete next[p.id];
      return next;
    });
    try {
      const c = await api.contact(p.id);
      onOpenConversation(c.conversationId);
    } catch (e) {
      setProblems((cur) => ({ ...cur, [p.id]: contactProblem(e) }));
    } finally {
      setContacting(null);
    }
  }

  const n = result.added.length;
  const extras = [
    result.alreadyPresent > 0 ? MESSAGES.dejaPresents(result.alreadyPresent) : null,
    result.horsCible > 0 ? MESSAGES.ecartes(result.horsCible) : null,
    result.rejected > 0 ? MESSAGES.rejetes(result.rejected) : null,
  ].filter((x): x is string => x !== null);

  return (
    <div className="search-result">
      {extras.length > 0 ? <p className="help">{extras.join(" ")}</p> : null}
      {n > 0 ? (
        <>
          {children}
          <ul className="search-list" aria-label={LABELS.resultTitle}>
            {result.added.map((p) => (
              <li key={p.id} className="search-item">
                <div className="search-item-head">
                  <strong>{p.entreprise}</strong>
                  {p.fonction ? <span className="muted"> · {p.fonction}</span> : null} <PertinenceBadge value={p.pertinence} />
                  {p.simule ? <span className="muted"> · exemple simulé</span> : null}
                </div>
                <p className="help search-cite">
                  <span className="search-cite-label">{LABELS.source} : </span>
                  {p.citation ?? MESSAGES.pasDeCitation}
                </p>
                {p.aVerifier.length > 0 ? <p className="help">À vérifier : {p.aVerifier.join(", ")}.</p> : null}
                <button type="button" className="btn btn-small" disabled={contacting !== null} onClick={() => void contact(p)} aria-label={`${LABELS.contact} ${p.entreprise}`}>
                  {contacting === p.id ? LABELS.contacting : LABELS.contact}
                </button>
                {problems[p.id] ? (
                  <p className="note note-warn search-problem" role="alert">
                    {problems[p.id]}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p>
        {onOpenCarnet ? (
          <button type="button" className="btn btn-small" onClick={onOpenCarnet}>
            {LABELS.carnet}
          </button>
        ) : (
          <Link className="btn btn-small" href={CARNET_HREF}>
            {LABELS.carnet}
          </Link>
        )}
      </p>
    </div>
  );
}
