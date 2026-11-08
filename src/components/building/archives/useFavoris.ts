"use client";

import { useCallback, useState } from "react";

const KEY = "rubix.carnet.favoris";

function read(): string[] {
  try {
    return (window.localStorage.getItem(KEY) ?? "").split(",").filter(Boolean);
  } catch {
    return [];
  }
}
function write(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, ids.join(","));
  } catch {
    /* stockage indisponible : réglage gardé en mémoire seulement */
  }
}

/** Favoris : réglage d'affichage propre à ce navigateur, jamais envoyé au serveur (aucun champ « favori » côté API). */
export function useFavoris() {
  const [ids, setIds] = useState<string[]>(() => read());
  const isFavori = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => {
    setIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      write(next);
      return next;
    });
  }, []);
  return { ids, isFavori, toggle };
}
export type Favoris = ReturnType<typeof useFavoris>;
