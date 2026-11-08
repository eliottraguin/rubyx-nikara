/**
 * Bus typé React <-> scène (docs/CARTE-TECH.md). Pas de Phaser, pas de React : testable seul.
 * React possède l'état ; la scène affiche et émet des INTENTIONS (clic, survol), jamais de résultat de jeu.
 * Vocabulaire de la ville : `planet` = lieu, `base` = votre immeuble ; les identifiants techniques ne changent pas.
 */
import type { Trip } from "./trips";
import type { MapViewModel } from "./viewmodel";

export interface MapEvents {
  /** scène -> React : clic sur un lieu ou sur l'immeuble (`base`) ; null = clic dans le vide. */
  "planet:select": [id: string | null];
  /** scène -> React : survol d'un lieu ou de l'immeuble (`base`). */
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
  /** React -> scène : recentrer sur l'immeuble du joueur (touche H, bouton « Recentrer »). */
  "camera:reset": [];
  /** React -> scène : centrer sur un lieu. */
  "camera:focus": [id: string];
  /** React -> scène : aller voir un lieu ou l'immeuble (travelling animé, décalé du panneau latéral). `base` = l'immeuble. */
  "view:enter": [id: string];
  /** React -> scène : quitter la vue et revenir à la carte (travelling retour). */
  "view:leave": [];
  /** React -> scène : voyages visuels des agents (la scène les anime d'après l'horloge). */
  trips: [trips: Trip[]];
  /** React -> scène : un gain vient d'être crédité par le serveur (animation de pièces vers l'immeuble). */
  reward: [planetId: string, amount: number];
  /** scène -> React : un chantier (montée de niveau) commence ou finit ; sert au bouton « Passer ». Jamais bloquant. */
  "building:construction": [active: boolean];
  /** React -> scène : passer l'animation de chantier. */
  "building:skip": [];
}

type Handler<K extends keyof MapEvents> = (...args: MapEvents[K]) => void;

export class MapBus {
  vm: MapViewModel | null = null;
  selectedId: string | null = null;
  reducedMotion = false;
  /** Largeur (px) du panneau latéral en surimpression : la caméra décale son cadrage pour garder le lieu visible. */
  insetRight = 0;
  trips: Trip[] = [];
  /**
   * Posé par la scène : dézoom animé de la ville (logout). Résolu à la fin ; `null` si la scène n'en a pas (Phaser)
   * ou n'existe plus. L'appelant ne doit jamais en dépendre pour naviguer (course contre un délai).
   */
  farewell: (() => Promise<void>) | null = null;
  /**
   * Posé par la scène : zoom animé vers l'immeuble du joueur avant d'ouvrir la vue bureau. Résolu à la fin ;
   * `null` sans scène 3D. L'appelant navigue toujours (course contre un délai), jamais bloquant.
   */
  enterBuilding: (() => Promise<void>) | null = null;
  /**
   * Posé par la scène : même mécanique qu'`enterBuilding`, mais vers un bâtiment de la ville sans lien avec la
   * prospection (boutique, évaluateur). `id` = identifiant du bâtiment ; résolu même si l'id est inconnu.
   */
  enterNav: ((id: string) => Promise<void>) | null = null;
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

  setInsetRight(px: number): void {
    this.insetRight = px;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.emit("motion", reduced);
  }

  clear(): void {
    this.handlers.clear();
  }
}
