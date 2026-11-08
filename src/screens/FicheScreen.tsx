"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FicheForm } from "@/components/fiche/FicheForm";
import { BackLink, Loading, RequireSession } from "@/components/ui";
import { TEXTES } from "@/content/fiche";
import { createProfileApiForMode, type Fiche, type ProfileApi } from "@/lib/api/profile";

function Fiche_({ tutoriel, api }: { tutoriel: boolean; api: ProfileApi }) {
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      setFiche(await api.get());
    } catch {
      setFailed(true);
    }
  }, [api]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture serveur au montage
    void load();
  }, [load]);
  if (failed)
    return (
      <p className="note note-bad" role="alert">
        {TEXTES.network}{" "}
        <button type="button" className="btn btn-small" onClick={() => void load()}>
          {TEXTES.retry}
        </button>
      </p>
    );
  if (!fiche) return <Loading label={TEXTES.loading} />;
  return <FicheForm initial={fiche} api={api} tutoriel={tutoriel} />;
}

export function FicheScreen({ api }: { api?: ProfileApi }) {
  const client = useMemo(() => api ?? createProfileApiForMode(), [api]);
  return (
    <div className="page">
      <BackLink href="/carte">Carte</BackLink>
      <RequireSession>{(state) => <Fiche_ tutoriel={state.session?.mode !== "expert"} api={client} />}</RequireSession>
    </div>
  );
}
