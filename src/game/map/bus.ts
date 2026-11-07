/**
 * Bus typé React <-> scène (docs/CARTE-TECH.md). Pas de Phaser, pas de React : testable seul.
 * React possède l'état ; la scène affiche et émet des INTENTIONS (clic, survol), jamais de résultat de jeu.
 */
import type { Trip } from "./trips";
import type { MapViewModel } from "./viewmodel";

export interface MapEvents {
  /** scène -> React : clic sur une planète (null = clic dans le vide). */
  "planet:select": [id: string | null];
  /** scène -> React : survol d'une planète. */
  "planet:hover": [id: string | null];
  /** scène -> React : la scène est prête (textures générées, premier rendu). */
  "scene:ready": [];
  /** React -> scène : l'état à afficher a changé. */
  vm: [vm: MapViewModel];
  /** React -> scène : sélection courante (source de vérité = React). */
  selected: [id: string | null];
  /** React -> scène : réduction des animations. */
  motion: [reduced: boolean];
  /** React -> scène : déplacer la caméra (pixels écran). */
  "camera:pan": [dx: number, dy: number];
  /** React -> scène : multiplier le zoom. */
  "camera:zoom": [factor: number];
  "camera:reset": [];
  /** React -> scène : centrer sur une planète. */
  "camera:focus": [id: string];
  /** React -> scène : entrer dans la vue d'une planète ou de la base (travelling animé). `base` = la base. */
  "view:enter": [id: string];
  /** React -> scène : quitter la vue et revenir à la carte (travelling retour). */
  "view:leave": [];
  /** React -> scène : voyages visuels des agents (la scène les anime d'après l'horloge). */
  trips: [trips: Trip[]];
  /** React -> scène : un gain vient d'être crédité par le serveur (animation de pièces vers la base). */
  reward: [planetId: string, amount: number];
}

type Handler<K extends keyof MapEvents> = (...args: MapEvents[K]) => void;

export class MapBus {
  vm: MapViewModel | null = null;
  selectedId: string | null = null;
  reducedMotion = false;
  trips: Trip[] = [];
  private handlers = new Map<keyof MapEvents, Set<(...a: never[]) => void>>();

  on<K extends keyof MapEvents>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as (...a: never[]) => void);
    return () => this.off(event, fn);
  }

  off<K extends keyof MapEvents>(event: K, fn: Handler<K>): void {
    this.handlers.get(event)?.delete(fn as (...a: never[]) => void);
  }

  emit<K extends keyof MapEvents>(event: K, ...args: MapEvents[K]): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) (fn as Handler<K>)(...args);
  }

  setVM(vm: MapViewModel): void {
    this.vm = vm;
    this.emit("vm", vm);
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.emit("selected", id);
  }

  setTrips(trips: Trip[]): void {
    this.trips = trips;
    this.emit("trips", trips);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.emit("motion", reduced);
  }

  clear(): void {
    this.handlers.clear();
  }
}
