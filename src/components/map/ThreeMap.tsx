"use client";

import { useEffect, useRef } from "react";
import type { MapBus } from "@/game/map/bus";
import { MapView } from "@/game/map/three/MapView";

/**
 * Équivalent Three.js de `PhaserMap` (ADR 0002), PAS ENCORE branché sur `/carte` (GR3-35).
 * Three.js direct, sans `@react-three/fiber` / `drei` : l'epic 1 (`CityScene`) pilote déjà le renderer à la main,
 * et r3f ajouterait une dépendance et un second cycle de vie à une scène impérative réutilisée telle quelle.
 * Une seule instance, détruite au démontage (compatible StrictMode). Sans WebGL : `onError` -> mode liste.
 */
export default function ThreeMap({ bus, onError }: { bus: MapBus; onError: (message: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let view: MapView | undefined;
    try {
      view = new MapView(canvas, bus);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : "Erreur de rendu");
    }
    return () => view?.dispose();
  }, [bus]);

  return <canvas ref={canvasRef} className="map-canvas" aria-hidden="true" data-testid="three-map" />;
}
