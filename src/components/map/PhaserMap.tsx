"use client";

import { useRef } from "react";
import type { MapBus } from "@/game/map/bus";
import { CityScene } from "./CityScene";

/** Crée une scène Three.js pour la ville (remplace Phaser). */
export default function PhaserMap({ bus, onError }: { bus: MapBus; onError: (message: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={hostRef} className="map-canvas" />
      <CityScene containerRef={hostRef} bus={bus} onError={onError} />
    </>
  );
}
