/**
 * Pure date-bucketing/aggregation math for the Stats screen (docs/PLAN.md M5). No React/store
 * imports — same discipline as `src/features/streak/streak.ts` (the timer machine, the pet
 * domain, and the merge rule all follow this too) — so the actually-hard part (which local
 * calendar days count as "the last 7 days", including at a DST boundary) is unit-testable with an
 * injected "now" instead of the real clock. `StatsScreen.tsx` should do no date math of its own:
 * it reads `stats.focusMsByDate` and calls these.
 */
import { toLocalDateString } from '@/features/streak';

export interface DayFocus {
  /** Local calendar date (YYYY-MM-DD) this bucket represents — the same key format
   *  `focusMsByDate` is written under in `useAppStore.awardSessionCompletion`. */
  dateKey: string;
  /** Total focus ms logged on that local date; 0 if the user did nothing that day. */
  focusMs: number;
  /** Whether this bucket is "today" relative to the `now` passed in. */
  isToday: boolean;
  /** 0 (Sunday) .. 6 (Saturday), from the same local `Date` `dateKey` was derived from — never
   *  re-derived by the caller via `new Date(dateKey)`, which parses a date-only string as UTC
   *  midnight and can read back the *previous* local day west of UTC. Keeps this math, like the
   *  rest of it, out of the rendering component. */
  weekday: number;
}

/**
 * The last `days` local calendar days, oldest first, ending with today — the weekly bars on the
 * Stats screen. Each day is derived by subtracting from `now`'s own local year/month/day *fields*
 * and letting `Date` renormalize the result, never by dividing raw milliseconds: an ms-based "7
 * days ago" breaks across a DST transition (a 23h or 25h day shifts every subsequent bucket by an
 * hour, which can round to the wrong calendar date near midnight), while field subtraction does
 * not, because `Date(y, m, d - i)` asks the runtime to resolve calendar arithmetic directly rather
 * than reproducing it by hand — exactly the failure mode `streak.ts`'s `calendarDayDiff` was
 * written to avoid, on the write side instead of the read side.
 */
export function getWeeklyFocus(
  focusMsByDate: Record<string, number>,
  now: Date,
  days = 7,
): DayFocus[] {
  const todayKey = toLocalDateString(now);
  const result: DayFocus[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateKey = toLocalDateString(day);
    result.push({
      dateKey,
      focusMs: focusMsByDate[dateKey] ?? 0,
      isToday: dateKey === todayKey,
      weekday: day.getDay(),
    });
  }
  return result;
}

/**
 * Today's local-date focus ms — reads back the same bucket a completed session's reward just
 * wrote (`useAppStore.awardSessionCompletion` keys `focusMsByDate` by `toLocalDateString`),
 * rather than the component re-deriving "today" itself.
 */
export function getTodayFocusMs(focusMsByDate: Record<string, number>, now: Date): number {
  return focusMsByDate[toLocalDateString(now)] ?? 0;
}
