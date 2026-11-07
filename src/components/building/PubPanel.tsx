"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCampaignsClient,
  errorCode,
  objectifLabel,
  platformLabel,
  pubErrorMessage,
  type AdKitInput,
  type Campaign,
  type CampaignInput,
  type CampaignList,
  type CampaignsClient,
} from "@/lib/api/campaigns";
import type { GameState } from "@/lib/api/types";
import { CampaignDetail } from "./pub/CampaignDetail";
import { CampaignForm } from "./pub/CampaignForm";

export interface PubPanelProps {
  state: GameState;
  /** Injectable pour les tests ; par défaut, client HTTP de `/api/campaigns`. */
  client?: CampaignsClient;
  /** Appelé après une génération réussie (le solde a changé côté serveur) : relire l'état. */
  onSpent?: () => void;
}

/**
 * Studio pub (section Pub, docs/PRODUIT-CLIENTS-PUB.md). Liste, création et détail de campagnes ; kits produits par
 * l'agent `ads`. Le produit ne publie rien et ne dépense rien : aucun bouton « Publier », aucun lien de plateforme.
 */
export function PubPanel({ state, client, onSpent }: PubPanelProps) {
  const api = useMemo(() => client ?? createCampaignsClient(), [client]);
  const [list, setList] = useState<CampaignList | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const adsOwned = state.agents.some((a) => a.role === "ads" && a.owned);
  const available = state.balance?.available ?? null;

  const reloadList = useCallback(async () => {
    try {
      const l = await api.list();
      if (alive.current) setList(l);
    } catch (e) {
      if (alive.current) setError(pubErrorMessage(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    api
      .list()
      .then((l) => !cancelled && setList(l))
      .catch((e) => !cancelled && setError(pubErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const open = async (id: string, numero?: number) => {
    setError(null);
    setInfo(null);
    try {
      const c = await api.get(id);
      if (!alive.current) return;
      setCampaign(c);
      setSelected(numero ?? c.versions[c.versions.length - 1]?.numero ?? null);
    } catch (e) {
      if (alive.current) setError(pubErrorMessage(e));
    }
  };

  /** Exécute une mutation : verrou, message d'erreur français, rechargement après un conflit de version. */
  const run = async (fn: () => Promise<void>, o: { reloadId?: string } = {}) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      if (!alive.current) return;
      const msg = pubErrorMessage(e);
      setError(msg);
      const id = o.reloadId;
      if (id && (errorCode(e) === "VERSION_CONFLICT" || errorCode(e) === "INVALID_OUTPUT")) {
        await open(id, selected ?? undefined);
        if (alive.current) setError(msg);
      }
      void reloadList();
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const back = () => {
    setCampaign(null);
    setSelected(null);
    setError(null);
    setInfo(null);
    void reloadList();
  };

  const create = (v: CampaignInput) =>
    run(async () => {
      const c = await api.create(v);
      setCreating(false);
      setCampaign(c);
      setSelected(null);
      void reloadList();
    });

  const full = list !== null && list.total >= list.max;

  return (
    <section className="card" aria-labelledby="pub-title">
      <h2 className="h3" id="pub-title">
        Studio pub
      </h2>
      <p className="note note-info" role="note">
        <strong>Rien n&apos;a été publié ni dépensé.</strong>
        {" "}
        <span>Vous copiez ou exportez le contenu, puis vous le publiez vous-même.</span>
      </p>
      {error && (
        <p className="note note-bad" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="note note-ok" role="status">
          {info}
        </p>
      )}

      {campaign ? (
        <CampaignDetail
          key={campaign.id}
          campaign={campaign}
          selected={selected}
          onSelect={setSelected}
          adsOwned={adsOwned}
          available={available}
          busy={busy}
          onBack={back}
          onGenerate={(consigne) =>
            run(
              async () => {
                const r = await api.generate(campaign.id, consigne);
                const c = await api.get(campaign.id);
                const num = c.versions.find((v) => v.id === r.versionId)?.numero ?? c.versions[c.versions.length - 1]?.numero ?? null;
                setCampaign(c);
                setSelected(num);
                setInfo("Kit prêt. Relisez-le : rien n'a été publié.");
                onSpent?.();
              },
              { reloadId: campaign.id },
            )
          }
          onPatch={(v) =>
            run(
              async () => {
                setCampaign(await api.patch(campaign.id, { ...v, version: campaign.version }));
              },
              { reloadId: campaign.id },
            )
          }
          onSaveCopy={(versionId, kit: AdKitInput) =>
            run(
              async () => {
                const v = await api.editVersion(campaign.id, versionId, campaign.version, kit);
                await open(campaign.id, v.numero);
                setInfo("Copie enregistrée comme nouvelle version.");
              },
              { reloadId: campaign.id },
            )
          }
          onDelete={() =>
            run(async () => {
              await api.remove(campaign.id);
              setCampaign(null);
              setSelected(null);
              void reloadList();
            })
          }
        />
      ) : creating ? (
        <div>
          <h3 className="h3">Nouvelle campagne</h3>
          <CampaignForm busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />
        </div>
      ) : (
        <div>
          {loading && <p className="loading">Chargement des campagnes…</p>}
          {list && (
            <>
              <p className="help" aria-live="polite">
                {list.total} campagne{list.total > 1 ? "s" : ""} sur {list.max} au maximum.
              </p>
              {list.items.length === 0 ? (
                <p className="help">Aucune campagne pour le moment.</p>
              ) : (
                <ul className="planet-list" aria-label="Campagnes">
                  {list.items.map((c) => (
                    <li key={c.id} className="planet-item">
                      <button type="button" className="btn" onClick={() => open(c.id)}>
                        <strong>{c.nom}</strong>
                        <span className="help">
                          {" "}
                          {objectifLabel(c.objectif)} · {platformLabel(c.plateforme)} ·{" "}
                          {c.derniere_version ? `version ${c.derniere_version}` : "pas encore de kit"} · {c.generations_remaining} génération
                          {c.generations_remaining > 1 ? "s" : ""} restante{c.generations_remaining > 1 ? "s" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p>
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} disabled={full}>
                  Nouvelle campagne
                </button>
                {full && <span className="help"> Nombre maximal de campagnes atteint : supprimez-en une.</span>}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
