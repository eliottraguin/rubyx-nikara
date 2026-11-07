"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { MapBus } from "@/game/map/bus";

/** Phaser (~1 Mo) n'est chargé que sur la page carte, côté navigateur : `ssr: false` exige un composant client. */
const PhaserMap = dynamic(() => import("./PhaserMap"), {
  ssr: false,
  loading: () => <div className="map-loading" role="status">Chargement de la carte…</div>,
});

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
      <PhaserMap bus={bus} onError={onError} />
    </Boundary>
  );
}
