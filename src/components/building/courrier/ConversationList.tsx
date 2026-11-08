"use client";

import type { Conversation } from "@/lib/api/conversations";
import { NEGOTIATION_LABELS, initials, isNegotiationNew, negotiationLabel, type NegotiationLabel } from "./negotiation";
import s from "./courrier.module.css";

const STATUS_CLASS: Record<NegotiationLabel, string> = {
  a_traiter: s.statusTraiter ?? "",
  en_negociation: s.statusNegociation ?? "",
  accepte: s.statusAccepte ?? "",
  abandonne: s.statusAbandonne ?? "",
};

function relative(iso: string | null): string {
  if (!iso) return "";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return "";
  const mins = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export interface ConversationListProps {
  items: Conversation[];
  openId: string | null;
  onOpen: (id: string) => void;
}

/** Liste de conversations (une par client) : avatar, offre, pastille « nouveau », statut de négociation. */
export function ConversationList({ items, openId, onOpen }: ConversationListProps) {
  return (
    <ul className={s.list} aria-label="Liste des conversations">
      {items.map((c) => {
        const label = negotiationLabel(c);
        const isNew = isNegotiationNew(c);
        const name = c.entreprise ?? "Prospect";
        return (
          <li key={c.id}>
            <button type="button" className={s.item} aria-pressed={openId === c.id} onClick={() => onOpen(c.id)}>
              <span className={s.avatar} aria-hidden="true">
                {initials(c.entreprise)}
              </span>
              <span className={s.itemBody}>
                <span className={s.itemTop}>
                  <strong>{name}</strong>
                  {c.negotiation_offer_initial != null ? <span className={s.offer}>{c.negotiation_offer_initial} $</span> : null}
                </span>
                <span className={s.preview}>{relative(c.dernier_message_le)}</span>
                <span className={s.itemFoot}>
                  {isNew ? (
                    <span className={s.newDot} role="img" aria-label="Nouveau message" title="Nouveau message" />
                  ) : null}
                  <span className={`${s.status} ${STATUS_CLASS[label]}`}>{NEGOTIATION_LABELS[label]}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
