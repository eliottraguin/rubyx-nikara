"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CityScene, ZoomOptions } from "@/game/login/CityScene";

/** Poignée impérative exposée au parent (écran de connexion, puis scène cible GR3-17 / GR3-35). */
export interface CityBackdropHandle {
  /** Zoom caméra vers la vue de quartier ; résolu à la fin. Résolu aussitôt si WebGL est indisponible. */
  zoomToDistrict(opts?: ZoomOptions): Promise<void>;
}

/**
 * Fond décoratif (ville isométrique + nuages) placé sous le formulaire de connexion.
 * Three.js est chargé à la demande ; sans WebGL, le fond uni du conteneur reste affiché.
 */
export const CityBackdrop = forwardRef<CityBackdropHandle, { seed?: number }>(function CityBackdrop(
  { seed = 2024 },
  handle,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);

  useImperativeHandle(
    handle,
    () => ({
      zoomToDistrict: (opts) => {
        const s = sceneRef.current;
        if (!s) {
          opts?.onZoomEnd?.();
          return Promise.resolve();
        }
        return s.zoomToDistrict(opts);
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let disposed = false;
    void Promise.all([import("@/game/login/CityScene"), import("@/game/login/plan")])
      .then(([{ CityScene }, { planCity }]) => {
        if (disposed) return;
        const s = new CityScene(canvas, planCity(seed));
        sceneRef.current = s;
        s.start();
      })
      .catch(() => {
        /* WebGL indisponible : le fond reste décoratif, le formulaire n'est pas affecté. */
      });
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [seed]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="city-backdrop"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: -1, background: "#bcd6ea" }}
    />
  );
});
