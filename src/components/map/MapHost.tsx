"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { MapBus } from "@/game/map/bus";
import { mapEngine } from "@/game/map/engine";

const loading = () => (
  <div className="map-loading" role="status">
    Chargement de la carte…
  </div>
);

/** Three.js (ADR 0002) n'est chargé que sur la page carte, côté navigateur : `ssr: false` exige un composant client. */
const ThreeMap = dynamic(() => import("./ThreeMap"), { ssr: false, loading });
/** Repli derrière `NEXT_PUBLIC_MAP_ENGINE=phaser` tant que l'ADR 0002 est en `draft` (jamais chargé sinon). */
const PhaserMap = dynamic(() => import("./PhaserMap"), { ssr: false, loading });

class Boundary extends Component<{ onError: (m: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function MapHost({ bus, onError }: { bus: MapBus; onError: (message: string) => void }) {
  return (
    <Boundary onError={onError}>
      {mapEngine() === "phaser" ? <PhaserMap bus={bus} onError={onError} /> : <ThreeMap bus={bus} onError={onError} />}
    </Boundary>
  );
}
