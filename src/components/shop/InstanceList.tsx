"use client";

import { useState } from "react";
import { shopErrorMessage, ShopError, type AgentInstance, type AgentInstanceStatus, type ShopApi } from "@/lib/api/shop";
import { ROLE_LABEL } from "@/lib/format";
import s from "./shop.module.css";

const STATUS_LABEL: Record<AgentInstanceStatus, string> = { idle: "Disponible", busy: "Occupé", traveling: "En route", disabled: "Désactivé" };

function RenameForm({ instance, api, onRenamed }: { instance: AgentInstance; api: ShopApi; onRenamed: (i: AgentInstance) => void }) {
  const [value, setValue] = useState(instance.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onRenamed(await api.rename(instance.id, value.trim()));
    } catch (e) {
      setError(e instanceof ShopError ? shopErrorMessage(e) : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={s.labelForm}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="sr-only" htmlFor={`label-${instance.id}`}>
        Surnom de {ROLE_LABEL[instance.role]}
      </label>
      <input id={`label-${instance.id}`} value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} placeholder="Donner un surnom" disabled={busy} />
      <button type="submit" className="btn btn-small" disabled={busy}>
        OK
      </button>
      {error ? (
        <span role="alert" className="help">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export function InstanceList({ instances, api, onRenamed }: { instances: AgentInstance[]; api: ShopApi; onRenamed: (i: AgentInstance) => void }) {
  if (instances.length === 0) {
    return (
      <div className={s.emptyState}>
        <p>Aucun agent acheté pour l&apos;instant.</p>
      </div>
    );
  }
  return (
    <ul className={s.instanceGrid}>
      {instances.map((i) => (
        <li key={i.id} className={s.instanceCard}>
          <strong>
            {i.label || ROLE_LABEL[i.role]} · palier {i.tier}
          </strong>
          <span>
            <span className={`${s.statusDot} ${s[`status-${i.status}`]}`} aria-hidden="true" />
            {STATUS_LABEL[i.status]}
          </span>
          <RenameForm instance={i} api={api} onRenamed={onRenamed} />
        </li>
      ))}
    </ul>
  );
}

export function statusLabel(status: AgentInstanceStatus): string {
  return STATUS_LABEL[status];
}
