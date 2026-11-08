"use client";

import { useCallback, useState } from "react";
import type { Tip } from "@/content/recherche";

const OFF_KEY = "rubix.aide.off";
const SEEN_KEY = "rubix.aide.vues";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : réglage gardé en mémoire seulement */
  }
}

/** Bulles d'aide du Tutoriel : désactivables (toutes) et masquables une par une ; réglage gardé dans ce navigateur. */
export function useTips(enabled: boolean) {
  const [off, setOff] = useState(() => read(OFF_KEY) === "1");
  const [seen, setSeen] = useState<string[]>(() => (read(SEEN_KEY) ?? "").split(",").filter(Boolean));
  const visible = useCallback((id: Tip["id"]) => enabled && !off && !seen.includes(id), [enabled, off, seen]);
  const dismiss = useCallback((id: Tip["id"]) => {
    setSeen((cur) => {
      const next = cur.includes(id) ? cur : [...cur, id];
      write(SEEN_KEY, next.join(","));
      return next;
    });
  }, []);
  const disableAll = useCallback(() => {
    setOff(true);
    write(OFF_KEY, "1");
  }, []);
  const enableAll = useCallback(() => {
    setOff(false);
    setSeen([]);
    write(OFF_KEY, null);
    write(SEEN_KEY, null);
  }, []);
  return { visible, dismiss, disableAll, enableAll, off, available: enabled };
}
export type Tips = ReturnType<typeof useTips>;
