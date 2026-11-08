"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { LoginCity } from "@/game/login/LoginCity";

/** Poignée impérative exposée à l'écran de connexion. */
export interface CityBackdropHandle {
  /** Plongée de la caméra vers l'immeuble du joueur ; résolue à la fin, ou aussitôt sans WebGL. */
  dive(): Promise<void>;
}

/**
 * Fond décoratif de la page de connexion : la ville de jeu vue de loin, sous des nuages. Three.js est chargé à la
 * demande ; sans WebGL, le fond uni du conteneur reste affiché et le formulaire n'est pas affecté.
 * `insetLeft` : largeur (px) du formulaire, la ville est décalée pour rester visible à côté.
 */
export const CityBackdrop = forwardRef<CityBackdropHandle, { seed?: number; insetLeft?: number }>(function CityBackdrop(
  { seed = 2024, insetLeft = 0 },
  handle,
) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cityRef = useRef<LoginCity | null>(null);
  const inset = useRef(insetLeft);

  useImperativeHandle(handle, () => ({ dive: () => cityRef.current?.dive() ?? Promise.resolve() }), []);

  useEffect(() => {
    inset.current = insetLeft;
    cityRef.current?.setInset(insetLeft);
  }, [insetLeft]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let disposed = false;
    void import("@/game/login/LoginCity")
      .then(({ LoginCity }) => {
        if (disposed) return;
        cityRef.current = new LoginCity(canvas, seed, inset.current);
      })
      .catch(() => {
        /* WebGL indisponible : le fond reste décoratif, le formulaire n'est pas affecté. */
      });
    return () => {
      disposed = true;
      cityRef.current?.dispose();
      cityRef.current = null;
    };
  }, [seed]);

  return <canvas ref={ref} aria-hidden="true" data-testid="city-backdrop" className="login-canvas" />;
});
