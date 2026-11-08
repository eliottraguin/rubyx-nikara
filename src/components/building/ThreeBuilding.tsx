"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import type { FloorId } from "@/game/building/floors";
import { BuildingScene } from "@/game/building/three/BuildingScene";
import { createFpsGuard } from "@/game/map/engine";

/**
 * Scène intérieure Three.js (ADR 0003), chargée seulement si `NEXT_PUBLIC_BUILDING_ENGINE=three`.
 * Même repli que `ThreeMap` : sans WebGL, ou si la boucle reste sous `FPS_MIN` images/s, `onError` -> DOM seul.
 * La liste des étages (DOM) reste l'accès clavier / lecteur d'écran ; le canvas est décoratif (aria-hidden).
 */
export default function ThreeBuilding({ selected, onSelect, onError, leaveRef }: { selected: FloorId | null; onSelect: (id: FloorId) => void; onError: (message: string) => void; leaveRef?: MutableRefObject<(() => Promise<void>) | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BuildingScene | null>(null);
  const selectRef = useRef(onSelect);
  const errorRef = useRef(onError);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectRef.current = onSelect;
    errorRef.current = onError;
    selectedRef.current = selected;
    sceneRef.current?.setSelected(selected);
  }, [onSelect, onError, selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: BuildingScene | undefined;
    try {
      scene = new BuildingScene(canvas, { onSelect: (id) => selectRef.current(id) });
      scene.setSelected(selectedRef.current);
      sceneRef.current = scene;
      const built = scene;
      if (leaveRef) leaveRef.current = () => built.leave();
    } catch (e) {
      errorRef.current(e instanceof Error ? e.message : "Erreur de rendu");
    }
    let raf = 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (scene && !reduced) {
      const guard = createFpsGuard();
      let last = 0;
      const tick = (now: number) => {
        if (last && guard.push((now - last) / 1000)) {
          errorRef.current("Le bureau est trop lent sur cet appareil.");
          return;
        }
        last = now;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      sceneRef.current = null;
      if (leaveRef) leaveRef.current = null;
      scene?.dispose();
    };
  }, [leaveRef]);

  return <canvas ref={canvasRef} className="building-canvas" aria-hidden="true" data-testid="three-building" />;
}
