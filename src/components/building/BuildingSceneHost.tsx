"use client";

import dynamic from "next/dynamic";
import { Component, useState, type MutableRefObject, type ReactNode } from "react";
import { buildingEngine } from "@/game/building/engine";
import type { FloorId } from "@/game/building/floors";

/** Three.js n'est chargé que si le moteur est `three` (défaut) et seulement côté navigateur. */
const ThreeBuilding = dynamic(() => import("./ThreeBuilding"), { ssr: false });

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Vue d'immeuble Three.js optionnelle. Rend `null` (DOM seul, comportement actuel) si le moteur n'est pas `three`,
 * ou après tout échec (WebGL absent, scène trop lente) : jamais d'écran vide.
 */
export function BuildingSceneHost({ selected, onSelect, leaveRef }: { selected: FloorId | null; onSelect: (id: FloorId) => void; leaveRef?: MutableRefObject<(() => Promise<void>) | null> }) {
  const [failed, setFailed] = useState(false);
  if (buildingEngine() !== "three" || failed) return null;
  return (
    <Boundary onError={() => setFailed(true)}>
      <ThreeBuilding selected={selected} onSelect={onSelect} onError={() => setFailed(true)} leaveRef={leaveRef} />
    </Boundary>
  );
}
