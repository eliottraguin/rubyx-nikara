"use client";

import { useEffect, useRef } from "react";
import type { MapBus } from "@/game/map/bus";
import { createFpsGuard } from "@/game/map/engine";
import { MapView } from "@/game/map/three/MapView";

/**
 * Équivalent Three.js de `PhaserMap` (ADR 0002), branché sur `/carte` par `MapHost` (GR3-35).
 * Three.js direct, sans `@react-three/fiber` / `drei` : l'epic 1 (`CityScene`) pilote déjà le renderer à la main,
 * et r3f ajouterait une dépendance et un second cycle de vie à une scène impérative réutilisée telle quelle.
 * Une seule instance, détruite au démontage (compatible StrictMode). Sans WebGL, ou si la boucle reste sous
 * `FPS_MIN` images/s (`createFpsGuard`) : `onError` -> mode liste, jamais d'écran vide.
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
    // Garde de lenteur : mesure le rythme réel des images du navigateur ; pas de boucle en animations réduites.
    let raf = 0;
    if (view && !bus.reducedMotion) {
      const guard = createFpsGuard();
      let last = 0;
      const tick = (now: number) => {
        if (last && guard.push((now - last) / 1000)) {
          onErrorRef.current("La ville est trop lente sur cet appareil.");
          return;
        }
        last = now;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      view?.dispose();
    };
  }, [bus]);

  return <canvas ref={canvasRef} className="map-canvas" aria-hidden="true" data-testid="three-map" />;
}
