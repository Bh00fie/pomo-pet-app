/**
 * Session-length helpers. Pure TypeScript (config only, no React/Native), so the clamping rules
 * that guard the user-adjustable work/break lengths are unit-testable.
 */
import { TIMER } from '@/config';

export const MS_PER_MINUTE = 60_000;

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * MS_PER_MINUTE);
}

export function msToMinutes(ms: number): number {
  return ms / MS_PER_MINUTE;
}

/**
 * Keep a user-chosen length inside the supported range. Non-numeric input falls back to the
 * minimum rather than throwing — this is fed by UI controls and persisted state, both of which
 * can go stale across schema versions.
 */
export function clampSessionMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return TIMER.minMinutes;
  return Math.min(TIMER.maxMinutes, Math.max(TIMER.minMinutes, Math.round(minutes)));
}

/** One press of the −/+ length controls, clamped to the supported range. */
export function stepSessionMinutes(minutes: number, direction: 1 | -1): number {
  return clampSessionMinutes(clampSessionMinutes(minutes) + direction * TIMER.stepMinutes);
}

/** True when the length is already at the end of the range (so the control can be disabled). */
export function isAtSessionBound(minutes: number, direction: 1 | -1): boolean {
  return stepSessionMinutes(minutes, direction) === clampSessionMinutes(minutes);
}
