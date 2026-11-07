"use client";

import { useEffect, useRef } from "react";
import type { MapBus } from "@/game/map/bus";
import { createMapGame } from "@/game/map/createGame";

/** Crée l'unique Phaser.Game et le DÉTRUIT au démontage (compatible StrictMode : double montage en dev). */
export default function PhaserMap({ bus, onError }: { bus: MapBus; onError: (message: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let game: ReturnType<typeof createMapGame> | undefined;
    try {
      game = createMapGame(host, bus, getComputedStyle(host).fontFamily);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : "Erreur de rendu");
    }
    return () => {
      game?.destroy(true);
    };
  }, [bus]);

  return <div ref={hostRef} className="map-canvas" />;
}
