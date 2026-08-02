/**
 * Daily streak logic (docs/PLAN.md M4): consecutive local calendar days with at least one
 * completed focus session. Pure — no React/RN/store imports, same discipline as the timer
 * machine and the pet domain — so the date math (the actually hard part: DST, timezone, midnight
 * boundaries) is unit-testable with an injected "now" rather than the real clock.
 *
 * Local time is load-bearing here, not incidental: `lastCompletedLocalDate` is stored as a
 * `YYYY-MM-DD` string derived from the device's local calendar day, never a UTC timestamp or
 * `toISOString()` slice — the latter silently shifts the date near midnight in any timezone west
 * of UTC.
 */

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` in LOCAL time for the given instant. This is the identity streaks are keyed on. */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calendar-day difference between two `YYYY-MM-DD` strings, computed from local midnight of each
 * date — NOT a division of the raw wall-clock ms between two `Date` instants, which breaks
 * across a DST transition (a 23h or 25h "day" would round to 0 or 2 instead of 1). Rounding
 * (rather than flooring) the ms distance between the two local-midnight instants absorbs any
 * single-day DST shift (all real ones are 1h, far under the ±12h this tolerates) while still
 * being exact for any non-DST gap.
 */
function calendarDayDiff(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number);
  const [ty, tm, td] = toDateStr.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd).getTime();
  const to = new Date(ty, tm - 1, td).getTime();
  return Math.round((to - from) / MS_PER_DAY);
}

export interface StreakInput {
  lastCompletedLocalDate: string | null;
  currentStreak: number;
  longestStreak: number;
  /** Injected so tests control "today" instead of this function calling `new Date()` itself —
   *  real callers pass `new Date(now)`. */
  now: Date;
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  lastCompletedLocalDate: string;
}

/**
 * Applies one completed session to the streak. Same local calendar day as the last completed
 * session leaves the streak unchanged (a second session today doesn't double-count); exactly one
 * calendar day later extends it by one; any other gap (including the very first session ever, a
 * skipped day, or a session that appears to be *before* the last one — clock skew) resets it to 1.
 */
export function applyCompletedSessionToStreak(input: StreakInput): StreakResult {
  const today = toLocalDateString(input.now);

  if (input.lastCompletedLocalDate === null) {
    return { currentStreak: 1, longestStreak: Math.max(1, input.longestStreak), lastCompletedLocalDate: today };
  }

  const dayDiff = calendarDayDiff(input.lastCompletedLocalDate, today);

  let currentStreak: number;
  if (dayDiff === 0) {
    // A second session today doesn't double-count. The floor of 1 is for the otherwise
    // unrepresentable state of "a session is recorded for today, but the streak says zero" —
    // a completed session can never leave the streak at 0.
    currentStreak = Math.max(1, input.currentStreak);
  } else if (dayDiff === 1) {
    currentStreak = input.currentStreak + 1;
  } else {
    // A gap of 2+ days, or a non-positive diff from an out-of-order clock, both restart the
    // streak — neither has a meaningful "partial credit" to preserve.
    currentStreak = 1;
  }

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, input.longestStreak),
    lastCompletedLocalDate: today,
  };
}
