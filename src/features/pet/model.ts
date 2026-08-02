/**
 * The pet/zoo domain model (docs/PLAN.md M2). Pure TypeScript — no React/RN/Skia imports — so
 * every rule here (what a fresh fish looks like, which stage it hatches at) is unit-testable
 * without a renderer, same discipline as `src/features/timer/machine.ts`.
 *
 * `Fish` is the type persisted in `src/store` (`PersistedState.fish`); `store/types.ts`
 * re-exports it from here rather than defining a second copy. As of the post-M6a reward
 * rearchitecture (see CLAUDE.md), `Fish` no longer carries an `xp` field: a completed session
 * hatches a fish directly onto a stage (`src/features/pet/reward.ts`) instead of growing one
 * toward a stage cap, so there is nothing left for XP to represent. Only a merge
 * (`src/features/pet/merge.ts`) advances a fish's stage from here on.
 */
import { STAGES, type StageId } from '@/config';

export type SpeciesId = string;
export type FishHealth = 'healthy' | 'sick';
export type Stage = StageId;

export interface Fish {
  id: string;
  speciesId: SpeciesId;
  stage: StageId;
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
  /** Multiplier on the reference dorsal fin size — independent of `pectoralFinScale` so a
   *  species' dorsal and pectoral fins can differ (e.g. a shark's large dorsal vs. its modest
   *  pectorals). Split from one shared `finScale` when the shark/clownfish species were added;
   *  every species that predates the split has both fields set to that species' old `finScale`
   *  value, so nothing about the three original fish changed. */
  dorsalFinScale: number;
  /** Multiplier on the reference pectoral fin size. See `dorsalFinScale`. */
  pectoralFinScale: number;
  /** Tail silhouette. Omit (or `'rounded'`) for the single paddle-shaped tail every original
   *  species uses; `'crescent'` swaps in a forked, heterocercal shark-style tail
   *  (`geometry.ts`'s `buildCrescentTail`). */
  tailShape?: 'rounded' | 'crescent';
  /** Optional pattern overlay drawn on top of the body. Omit for a plain body — every species
   *  before the clownfish has no pattern. `'stripes'` draws 2–3 white vertical bands with a dark
   *  edge (`geometry.ts`'s `buildStripeBands`); this is the one pattern the renderer supports, not
   *  a general configurable pattern system. */
  pattern?: 'stripes';
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
 *  with betta-style flowing fins (larger `tailSpan`/fin scales than either other species) so it
 *  reads as a distinct shape, not just a recolor. */
export const INDIGO_BETTA_SPECIES_ID: SpeciesId = 'indigo-betta';
/** Sold in the shop (post-M6a species pass). Grey/blue-grey, low-saturation, cool hue — the first
 *  species to use a genuinely different body/fin/tail archetype rather than a variant of the
 *  rounder fish silhouette: an elongated torpedo body (a much higher length-to-height ratio than
 *  any other species), a proportionally large dorsal fin (`dorsalFinScale`) with modest pectorals
 *  (`pectoralFinScale`), and a forked `tailShape: 'crescent'` tail. */
export const SHARK_SPECIES_ID: SpeciesId = 'reef-shark';
/** Sold in the shop (post-M6a species pass). Vivid orange, with the app's first `pattern` —
 *  `'stripes'` draws the white bands a real clownfish is known for. Body is deliberately chubbier
 *  (a lower length-to-height ratio) with small, modest fins, since the stripe pattern is the
 *  differentiator here, not an exaggerated silhouette the way the shark or betta are. */
export const CLOWNFISH_SPECIES_ID: SpeciesId = 'clownfish';

const STARTER_SPECIES: Species = {
  id: STARTER_SPECIES_ID,
  name: 'Coral Tetra',
  hue: 12,
  saturation: 62,
  lightness: 56,
  stageParams: {
    fry: { bodyLength: 30, bodyHeight: 18, tailSpan: 0.72, dorsalFinScale: 0.7, pectoralFinScale: 0.7 },
    juvenile: { bodyLength: 46, bodyHeight: 27, tailSpan: 0.92, dorsalFinScale: 0.9, pectoralFinScale: 0.9 },
    elder: { bodyLength: 64, bodyHeight: 36, tailSpan: 1.15, dorsalFinScale: 1.1, pectoralFinScale: 1.1 },
  },
};

const GOLDEN_KOI_SPECIES: Species = {
  id: GOLDEN_KOI_SPECIES_ID,
  name: 'Golden Koi',
  hue: 40,
  saturation: 82,
  lightness: 58,
  stageParams: {
    fry: { bodyLength: 32, bodyHeight: 20, tailSpan: 0.8, dorsalFinScale: 0.76, pectoralFinScale: 0.76 },
    juvenile: { bodyLength: 50, bodyHeight: 30, tailSpan: 1.02, dorsalFinScale: 0.96, pectoralFinScale: 0.96 },
    elder: { bodyLength: 70, bodyHeight: 41, tailSpan: 1.28, dorsalFinScale: 1.16, pectoralFinScale: 1.16 },
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
    fry: { bodyLength: 26, bodyHeight: 15, tailSpan: 0.98, dorsalFinScale: 0.95, pectoralFinScale: 0.95 },
    juvenile: { bodyLength: 40, bodyHeight: 22, tailSpan: 1.4, dorsalFinScale: 1.3, pectoralFinScale: 1.3 },
    elder: { bodyLength: 56, bodyHeight: 31, tailSpan: 1.85, dorsalFinScale: 1.7, pectoralFinScale: 1.7 },
  },
};

const SHARK_SPECIES: Species = {
  id: SHARK_SPECIES_ID,
  name: 'Reef Shark',
  hue: 205,
  saturation: 14,
  lightness: 46,
  stageParams: {
    // Length-to-height ratio climbs from ~2.4 to ~2.7 as it grows — an elongated torpedo body,
    // unlike every other species' ~1.5-1.8 ratio. Dorsal fin scale grows well past pectoral scale
    // at every stage (the "large dorsal, modest pectorals" silhouette), and `tailShape: 'crescent'`
    // swaps in the forked tail instead of the shared rounded paddle.
    fry: {
      bodyLength: 34,
      bodyHeight: 14,
      tailSpan: 0.85,
      dorsalFinScale: 1.6,
      pectoralFinScale: 0.55,
      tailShape: 'crescent',
    },
    juvenile: {
      bodyLength: 54,
      bodyHeight: 21,
      tailSpan: 1.0,
      dorsalFinScale: 1.9,
      pectoralFinScale: 0.65,
      tailShape: 'crescent',
    },
    elder: {
      bodyLength: 76,
      bodyHeight: 28,
      tailSpan: 1.2,
      dorsalFinScale: 2.3,
      pectoralFinScale: 0.75,
      tailShape: 'crescent',
    },
  },
};

const CLOWNFISH_SPECIES: Species = {
  id: CLOWNFISH_SPECIES_ID,
  name: 'Clownfish',
  hue: 22,
  saturation: 90,
  lightness: 58,
  stageParams: {
    // Chubbier ratio (~1.45-1.5) than any other species, and small fins on both axes — the
    // silhouette stays close to the base fish shape on purpose, because `pattern: 'stripes'` is
    // the feature doing the differentiating here, not an exaggerated body or fins.
    fry: {
      bodyLength: 28,
      bodyHeight: 19,
      tailSpan: 0.65,
      dorsalFinScale: 0.6,
      pectoralFinScale: 0.6,
      pattern: 'stripes',
    },
    juvenile: {
      bodyLength: 42,
      bodyHeight: 29,
      tailSpan: 0.8,
      dorsalFinScale: 0.75,
      pectoralFinScale: 0.75,
      pattern: 'stripes',
    },
    elder: {
      bodyLength: 58,
      bodyHeight: 40,
      tailSpan: 0.95,
      dorsalFinScale: 0.9,
      pectoralFinScale: 0.9,
      pattern: 'stripes',
    },
  },
};

/** Display order for the shop and anywhere else the whole catalog is listed — deliberately
 *  explicit rather than relying on object-key insertion order, so the list doesn't silently
 *  reorder if `SPECIES` is ever restructured. */
export const SPECIES_ORDER: readonly SpeciesId[] = [
  STARTER_SPECIES_ID,
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
  SHARK_SPECIES_ID,
  CLOWNFISH_SPECIES_ID,
];

export const SPECIES: Readonly<Record<SpeciesId, Species>> = {
  [STARTER_SPECIES_ID]: STARTER_SPECIES,
  [GOLDEN_KOI_SPECIES_ID]: GOLDEN_KOI_SPECIES,
  [INDIGO_BETTA_SPECIES_ID]: INDIGO_BETTA_SPECIES,
  [SHARK_SPECIES_ID]: SHARK_SPECIES,
  [CLOWNFISH_SPECIES_ID]: CLOWNFISH_SPECIES,
};

/** Falls back to the starter species for an unknown id, rather than throwing — persisted fish
 *  data can outlive a species being removed from the catalog. */
export function getSpecies(id: SpeciesId): Species {
  return SPECIES[id] ?? STARTER_SPECIES;
}

/** A freshly hatched fish at a specific stage, healthy, born now. Every hatch in the app — a
 *  completed session or a debug-panel action — goes through this or `createFish` below, or
 *  `merge.ts`'s own next-stage construction; never a second inline `{ id, speciesId, stage, ... }`
 *  literal (see `reward.ts`'s `hatchFish`, the one hatch primitive). */
export function createFishAtStage(speciesId: SpeciesId, stage: StageId, bornAt: number, id: string): Fish {
  return { id, speciesId, stage, bornAt, health: 'healthy' };
}

/** A freshly hatched Fry. Kept as a convenience wrapper over `createFishAtStage` for callers that
 *  specifically want the entry stage — since the post-M6a reward rearchitecture, *which* stage a
 *  session hatches is itself a decision (`reward.ts`'s short/long rule), so not every hatch wants
 *  a Fry. */
export function createFish(speciesId: SpeciesId, bornAt: number, id: string): Fish {
  return createFishAtStage(speciesId, STAGES[0], bornAt, id);
}

export function stageIndex(stage: StageId): number {
  return STAGES.indexOf(stage);
}

export function isMaxStage(stage: StageId): boolean {
  return stageIndex(stage) === STAGES.length - 1;
}

/** The next stage up, or `null` if already at the top — crossing it is a merge (M3), the only way
 *  left in the app for a fish to advance. */
export function nextStage(stage: StageId): StageId | null {
  const next = STAGES[stageIndex(stage) + 1];
  return next ?? null;
}
