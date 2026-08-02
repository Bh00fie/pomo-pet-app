/**
 * No uuid dependency is installed; this is deliberately simple — fish ids only need to be
 * unique within one device's local collection, never compared across devices.
 */
export function generateFishId(now: number = Date.now()): string {
  return `fish-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
