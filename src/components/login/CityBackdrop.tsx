"use client";

import { useEffect, useRef } from "react";

/**
 * Fond décoratif (ville isométrique + nuages) placé sous le formulaire de connexion.
 * Three.js est chargé à la demande ; sans WebGL, le fond uni du conteneur reste affiché.
 */
export function CityBackdrop({ seed = 2024 }: { seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let disposed = false;
    let scene: { dispose(): void } | null = null;
    void Promise.all([import("@/game/login/CityScene"), import("@/game/login/plan")])
      .then(([{ CityScene }, { planCity }]) => {
        if (disposed) return;
        const s = new CityScene(canvas, planCity(seed));
        scene = s;
        s.start();
      })
      .catch(() => {
        /* WebGL indisponible : le fond reste décoratif, le formulaire n'est pas affecté. */
      });
    return () => {
      disposed = true;
      scene?.dispose();
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
}
