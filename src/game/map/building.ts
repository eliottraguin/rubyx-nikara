/**
 * Immeuble du joueur (pur, sans Phaser ni React ; docs/VILLE-ET-BATIMENT.md §4).
 * Le NIVEAU vient uniquement de l'état serveur (`GameState.building`) : ni ce module ni le navigateur ne le calculent.
 * Il est purement visuel et ne débloque aucun droit. L'apparence par niveau vit dans data/map/building_v1.json.
 */
import buildingJson from "../../../data/map/building_v1.json";
import type { BuildingState } from "@/lib/api/types";
import { money } from "@/lib/format";

export const BUILDING_MAX_LEVEL = 10;
export const SIGN_MAX_CHARS = 24;

export interface BuildingAppearance {
  level: number;
  label: string;
  floors: number;
  /** Largeur (et profondeur) du corps principal en cases. */
  width: number;
  wall: string;
  trim: string;
  glass: string;
  sign: "simple" | "lit";
  features: string[];
}

interface RawBuilding {
  max_level: number;
  px_per_floor: number;
  levels: BuildingAppearance[];
}

const RAW = buildingJson as RawBuilding;

export const PX_PER_FLOOR: number = RAW.px_per_floor;

/** Apparences triées par niveau (1 à 10). */
export const APPEARANCES: readonly BuildingAppearance[] = [...RAW.levels].sort((a, b) => a.level - b.level);

/** Niveau valide (entier de 1 à 10) : toute valeur invalide donne le niveau 1. */
export function clampLevel(level: unknown): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return 1;
  return Math.min(BUILDING_MAX_LEVEL, Math.max(1, Math.floor(level)));
}

export function appearanceFor(level: unknown): BuildingAppearance {
  const l = clampLevel(level);
  return APPEARANCES.find((a) => a.level === l) ?? APPEARANCES[0]!;
}

/** Hauteur du corps en pixels monde (étages × hauteur d'un étage). */
export const buildingHeightPx = (level: unknown): number => appearanceFor(level).floors * PX_PER_FLOOR;

export interface BuildingVM {
  level: number;
  maxLevel: number;
  totalEarned: number;
  nextLevelAt: number | null;
  /** `serveur` : lu dans /state ; `defaut` : l'API ne le renvoie pas encore (niveau 1). */
  source: "serveur" | "defaut";
  /** Équivalent texte permanent (docs/VILLE-ET-BATIMENT.md §4). */
  text: string;
  /** Apparence du niveau (texte court). */
  appearance: string;
}

/** « Immeuble niveau 5 sur 10, 112 $ gagnés au total, prochain niveau à 125 $ ». */
export function buildingText(level: number, totalEarned: number, nextLevelAt: number | null): string {
  const parts = [`Immeuble niveau ${level} sur ${BUILDING_MAX_LEVEL}`, `${money(totalEarned)} gagné${totalEarned > 1 ? "s" : ""} au total`];
  if (level >= BUILDING_MAX_LEVEL) parts.push("niveau maximal atteint");
  else if (nextLevelAt !== null) parts.push(`prochain niveau à ${money(nextLevelAt)}`);
  return parts.join(", ");
}

/** État serveur -> immeuble affiché. Sans `building` (API pas encore à jour) : niveau 1 par défaut. */
export function buildingVM(b: BuildingState | null | undefined): BuildingVM {
  const source: BuildingVM["source"] = b ? "serveur" : "defaut";
  const level = clampLevel(b?.level);
  const totalEarned = typeof b?.total_earned === "number" && Number.isFinite(b.total_earned) ? Math.max(0, Math.floor(b.total_earned)) : 0;
  const next = level >= BUILDING_MAX_LEVEL ? null : typeof b?.next_level_at === "number" && Number.isFinite(b.next_level_at) ? b.next_level_at : null;
  return { level, maxLevel: BUILDING_MAX_LEVEL, totalEarned, nextLevelAt: next, source, text: buildingText(level, totalEarned, next), appearance: appearanceFor(level).label };
}

/** Annonce d'une montée de niveau (aria-live et message texte en animations réduites) ; null sinon. */
export function levelUpMessage(prev: number, next: number): string | null {
  const a = clampLevel(prev);
  const b = clampLevel(next);
  return b > a ? `Votre immeuble passe au niveau ${b}.` : null;
}

/**
 * Texte de l'enseigne : nom de l'entreprise en TEXTE BRUT (jamais de HTML), espaces normalisés, caractères de contrôle
 * retirés, tronqué à 24 caractères (le dernier devient « … »).
 */
export function truncateSign(name: string | null | undefined, max = SIGN_MAX_CHARS): string {
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "Votre entreprise";
  const chars = Array.from(clean);
  return chars.length <= max ? clean : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

const BANNER_COLORS = ["#d94f4f", "#e08a1e", "#2e9e6b", "#2f80d1", "#8a5bd6", "#d6559a", "#16a3a3", "#c2a21a"] as const;

/** Couleur du fanion, déterministe d'après le nom (« la couleur de la partie »). */
export function bannerColor(name: string | null | undefined): string {
  let h = 2166136261;
  for (const c of name ?? "") h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return BANNER_COLORS[(h >>> 0) % BANNER_COLORS.length]!;
}
