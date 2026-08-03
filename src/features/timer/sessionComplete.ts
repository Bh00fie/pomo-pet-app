/**
 * Pure string-formatting for the Session Complete moment (concept-gallery gap, see CLAUDE.md).
 * No React/RN imports, same discipline as `machine.ts`/`reward.ts` — `SessionCompleteScreen.tsx`
 * is the only renderer of this copy, but the naming rule itself is independent of it.
 */
import { getSpecies, type Fish } from '@/features/pet/model';

/** Stage names as a user reads them, rather than the lowercase `StageId` the domain stores. */
export const STAGE_LABELS: Record<Fish['stage'], string> = {
  fry: 'Fry',
  juvenile: 'Juvenile',
  elder: 'Elder',
};

/** "A Golden Koi Juvenile hatched." — reads the species off the fish itself, not off the active
 *  species setting, because a long session draws its species at random and the two disagree. */
export function hatchHeadline(fish: Fish): string {
  return `A ${getSpecies(fish.speciesId).name} ${STAGE_LABELS[fish.stage]} hatched.`;
}
