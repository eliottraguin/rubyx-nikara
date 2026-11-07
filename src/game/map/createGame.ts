/**
 * Création de l'unique `Phaser.Game` de la carte. Ce module (et `scenes/`, `art.ts`) est le SEUL à importer Phaser
 * à l'exécution : il n'est chargé qu'à la demande par `components/map/PhaserMap.tsx` (jamais dans le bundle des
 * autres pages).
 */
import Phaser from "phaser";
import type { MapBus } from "./bus";
import { WorldScene } from "./scenes/WorldScene";

export function createMapGame(parent: HTMLElement, bus: MapBus, fontFamily: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#08141b",
    width: Math.max(parent.clientWidth, 320),
    height: Math.max(parent.clientHeight, 320),
    scale: { mode: Phaser.Scale.RESIZE },
    scene: [WorldScene],
    // Pas de clavier Phaser : il capture les touches globalement. Les raccourcis sont gérés par le conteneur React.
    input: { keyboard: false, gamepad: false, windowEvents: false },
    audio: { noAudio: true },
    banner: false,
    disableContextMenu: true,
    render: { antialias: true, powerPreference: "low-power" },
    callbacks: {
      preBoot: (game) => {
        game.registry.set("bus", bus);
        game.registry.set("font", fontFamily);
      },
    },
  });
}
