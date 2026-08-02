/**
 * The pet/zoo domain model (docs/PLAN.md M2). Pure TypeScript — no React/RN/Skia imports — so
 * every rule here (what a fresh fish looks like, how XP accrues) is unit-testable without a
 * renderer, same discipline as `src/features/timer/machine.ts`.
 *
 * `Fish` is the type persisted in `src/store` (`PersistedState.fish`); `store/types.ts`
 * re-exports it from here rather than defining a second copy.
 */
import { GROWTH, STAGES, type StageId } from '@/config';

export type SpeciesId = string;
export type FishHealth = 'healthy' | 'sick';
export type Stage = StageId;

export interface Fish {
  id: string;
  speciesId: SpeciesId;
  stage: StageId;
  /** XP accrued *within* the current stage. Never crosses a stage on its own — merging does. */
  xp: number;
  bornAt: number;
  health: FishHealth;
}

/** Visual/build parameters for one growth stage — consumed by the Skia fish renderer's
 *  parametric shape builder (`src/features/pet/geometry.ts`). Not persisted; static per species. */
export interface StageVisualParams {
  /** Full body length, px, at the reference tank scale. */
  bodyLength: number;
  /** Full body height, px. */
  bodyHeight: number;
  /** Multiplier on the reference tail size. */
  tailSpan: number;
  /** Multiplier on the reference dorsal/pectoral fin size. */
  finScale: number;
}

export interface Species {
  id: SpeciesId;
  name: string;
  /** HSL hue, 0–360. */
  hue: number;
  saturation: number;
  lightness: number;
  stageParams: Record<StageId, StageVisualParams>;
}

/** The starter species — always unlocked, never sold (docs/PLAN.md M2, M6a). */
export const STARTER_SPECIES_ID: SpeciesId = 'coral-tetra';
/** Sold in the shop (docs/PLAN.md M6a). Warm gold/orange, same silhouette family as the starter
 *  (a gentler, rounder body) so the two visibly belong to the same procedural system. */
export const GOLDEN_KOI_SPECIES_ID: SpeciesId = 'golden-koi';
/** Sold in the shop (docs/PLAN.md M6a). Deep indigo/blue — the coldest hue in the catalog, paired
 *  with betta-style flowing fins (larger `tailSpan`/`finScale` than either other species) so it
 *  reads as a distinct shape, not just a recolor. */
export const INDIGO_BETTA_SPECIES_ID: SpeciesId = 'indigo-betta';

const STARTER_SPECIES: Species = {
  id: STARTER_SPECIES_ID,
  name: 'Coral Tetra',
  hue: 12,
  saturation: 62,
  lightness: 56,
  stageParams: {
    fry: { bodyLength: 30, bodyHeight: 18, tailSpan: 0.72, finScale: 0.7 },
    juvenile: { bodyLength: 46, bodyHeight: 27, tailSpan: 0.92, finScale: 0.9 },
    elder: { bodyLength: 64, bodyHeight: 36, tailSpan: 1.15, finScale: 1.1 },
  },
};

const GOLDEN_KOI_SPECIES: Species = {
  id: GOLDEN_KOI_SPECIES_ID,
  name: 'Golden Koi',
  hue: 40,
  saturation: 82,
  lightness: 58,
  stageParams: {
    fry: { bodyLength: 32, bodyHeight: 20, tailSpan: 0.8, finScale: 0.76 },
    juvenile: { bodyLength: 50, bodyHeight: 30, tailSpan: 1.02, finScale: 0.96 },
    elder: { bodyLength: 70, bodyHeight: 41, tailSpan: 1.28, finScale: 1.16 },
  },
};

const INDIGO_BETTA_SPECIES: Species = {
  id: INDIGO_BETTA_SPECIES_ID,
  name: 'Indigo Betta',
  hue: 248,
  saturation: 68,
  lightness: 46,
  stageParams: {
    // Smaller body than the other two species but noticeably longer tail/fins at every stage —
    // a betta's silhouette is defined by its flowing fins, not its body size.
    fry: { bodyLength: 26, bodyHeight: 15, tailSpan: 0.98, finScale: 0.95 },
    juvenile: { bodyLength: 40, bodyHeight: 22, tailSpan: 1.4, finScale: 1.3 },
    elder: { bodyLength: 56, bodyHeight: 31, tailSpan: 1.85, finScale: 1.7 },
  },
};

/** Display order for the shop and anywhere else the whole catalog is listed — deliberately
 *  explicit rather than relying on object-key insertion order, so the list doesn't silently
 *  reorder if `SPECIES` is ever restructured. */
export const SPECIES_ORDER: readonly SpeciesId[] = [
  STARTER_SPECIES_ID,
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
];

export const SPECIES: Readonly<Record<SpeciesId, Species>> = {
  [STARTER_SPECIES_ID]: STARTER_SPECIES,
  [GOLDEN_KOI_SPECIES_ID]: GOLDEN_KOI_SPECIES,
  [INDIGO_BETTA_SPECIES_ID]: INDIGO_BETTA_SPECIES,
};

/** Falls back to the starter species for an unknown id, rather than throwing — persisted fish
 *  data can outlive a species being removed from the catalog. */
export function getSpecies(id: SpeciesId): Species {
  return SPECIES[id] ?? STARTER_SPECIES;
}

/** A freshly hatched fish: stage 1 (Fry), no XP, healthy. */
export function createFish(speciesId: SpeciesId, bornAt: number, id: string): Fish {
  return { id, speciesId, stage: STAGES[0], xp: 0, bornAt, health: 'healthy' };
}

export function stageIndex(stage: StageId): number {
  return STAGES.indexOf(stage);
}

export function isMaxStage(stage: StageId): boolean {
  return stageIndex(stage) === STAGES.length - 1;
}

/** The next stage up, or `null` if already at the top — crossing it is a merge (M3), not XP. */
export function nextStage(stage: StageId): StageId | null {
  const next = STAGES[stageIndex(stage) + 1];
  return next ?? null;
}

/** Add XP to a fish, clamped to the stage cap. Growth never crosses a stage on its own — once a
 *  fish is capped it just holds there until a merge (M3) advances it. */
export function addXp(fish: Fish, amount: number): Fish {
  if (amount <= 0) return fish;
  const xp = Math.min(GROWTH.xpPerStage, fish.xp + amount);
  if (xp === fish.xp) return fish;
  return { ...fish, xp };
}

/** 0…1 fill fraction of the current stage's XP bar. */
export function stageProgress(fish: Fish): number {
  if (GROWTH.xpPerStage <= 0) return 0;
  return Math.min(1, Math.max(0, fish.xp / GROWTH.xpPerStage));
}

/** True once a fish has filled its stage bar and is waiting on a merge to advance (M3). */
export function isReadyToMerge(fish: Fish): boolean {
  return fish.xp >= GROWTH.xpPerStage;
}
