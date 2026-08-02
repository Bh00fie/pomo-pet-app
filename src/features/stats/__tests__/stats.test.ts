import { getTodayFocusMs, getWeeklyFocus } from '../stats';

describe('getWeeklyFocus — basics', () => {
  it('returns 7 buckets oldest-first, ending with today, when days is omitted', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0); // Jan 15
    const result = getWeeklyFocus({}, now);

    expect(result).toHaveLength(7);
    expect(result[0].dateKey).toBe('2026-01-09');
    expect(result[6].dateKey).toBe('2026-01-15');
    expect(result[6].isToday).toBe(true);
    expect(result.slice(0, 6).every((d) => d.isToday === false)).toBe(true);
  });

  it('fills a day with no recorded focus time as 0, not undefined', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0);
    const result = getWeeklyFocus({ '2026-01-14': 25 * 60_000 }, now);

    expect(result.find((d) => d.dateKey === '2026-01-14')?.focusMs).toBe(25 * 60_000);
    expect(result.find((d) => d.dateKey === '2026-01-13')?.focusMs).toBe(0);
  });

  it('ignores focusMsByDate entries outside the requested window', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0);
    const result = getWeeklyFocus({ '2025-12-01': 60_000 }, now);

    expect(result.some((d) => d.dateKey === '2025-12-01')).toBe(false);
    expect(result.reduce((sum, d) => sum + d.focusMs, 0)).toBe(0);
  });

  it('derives weekday from the same local date as dateKey, not by re-parsing the string as UTC', () => {
    // 2026-01-15 is a Thursday (weekday 4). Re-parsing the YYYY-MM-DD string with `new Date()`
    // would read it as UTC midnight, which for any timezone behind UTC lands on Jan 14 (a
    // Wednesday) instead — exactly the class of bug `toLocalDateString`/`calendarDayDiff` exist
    // to prevent on the streak side.
    const now = new Date(2026, 0, 15, 0, 30, 0); // just after local midnight
    const result = getWeeklyFocus({}, now);
    expect(result[6]).toMatchObject({ dateKey: '2026-01-15', weekday: 4 });
  });

  it('respects a custom `days` window', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0);
    const result = getWeeklyFocus({}, now, 3);

    expect(result).toHaveLength(3);
    expect(result.map((d) => d.dateKey)).toEqual(['2026-01-13', '2026-01-14', '2026-01-15']);
  });

  it('is keyed on the same local calendar day as toLocalDateString/streak.ts, not a UTC slice', () => {
    // Late-night local time — a UTC-based key would already have rolled to the next day here in
    // most western timezones, including the pinned America/New_York test zone.
    const now = new Date(2026, 0, 15, 23, 45, 0);
    const result = getWeeklyFocus({}, now);
    expect(result[6].dateKey).toBe('2026-01-15');
    expect(result[6].isToday).toBe(true);
  });
});

describe('getWeeklyFocus — month/year boundaries', () => {
  it('crosses a month boundary correctly', () => {
    const now = new Date(2026, 1, 2, 12, 0, 0); // Feb 2
    const result = getWeeklyFocus({}, now);
    expect(result.map((d) => d.dateKey)).toEqual([
      '2026-01-27',
      '2026-01-28',
      '2026-01-29',
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('crosses a year boundary correctly', () => {
    const now = new Date(2026, 0, 2, 12, 0, 0); // Jan 2, 2026
    const result = getWeeklyFocus({}, now);
    expect(result.map((d) => d.dateKey)).toEqual([
      '2025-12-27',
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('handles a leap-year February correctly', () => {
    const now = new Date(2028, 2, 2, 12, 0, 0); // 2028 is a leap year; March 2
    const result = getWeeklyFocus({}, now);
    expect(result[0].dateKey).toBe('2028-02-25'); // 6 days before Mar 2, through Feb 29
    expect(result).toContainEqual(expect.objectContaining({ dateKey: '2028-02-29' }));
  });
});

describe('getWeeklyFocus — DST transitions (America/New_York, pinned in jest.config.js)', () => {
  // The zone is pinned by `jest.config.js`, which sets it before Jest forks its workers —
  // assigning `process.env.TZ` from in here would be silently ignored and these tests would
  // degrade into ordinary 24h-day tests without failing. Assert it instead of assuming it.
  // (Same guard as `src/features/streak/__tests__/streak.test.ts`, for the same M4 reason.)
  it('runs in the DST-observing zone these dates depend on', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  });

  /** Ms between local midnight of two `YYYY-MM-DD` dates — asserted on directly below so a wrong
   *  date pair cannot silently turn a DST test into a plain 24h-day test. Mirrors the helper in
   *  the streak suite. */
  function midnightSpanHours(fromDateStr: string, toDateStr: string): number {
    const [fy, fm, fd] = fromDateStr.split('-').map(Number);
    const [ty, tm, td] = toDateStr.split('-').map(Number);
    return (new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / 3_600_000;
  }

  /**
   * These two tests must be run from a `now` that is **within an hour of local midnight on a day
   * after the transition**, looking back *across* it. That is the only shape that discriminates:
   * the DST shift is one hour, so from any `now` around midday a naive
   * `new Date(now.getTime() - i * 86_400_000)` still lands on the right calendar date and the test
   * passes against a broken implementation. Verified by mutation — swapping the field arithmetic
   * in `stats.ts` for raw ms subtraction fails exactly these two and nothing else in this file.
   */
  it('spring-forward: the 23h day is still its own bucket, not skipped', () => {
    expect(midnightSpanHours('2026-03-08', '2026-03-09')).toBe(23);

    // 00:30 on March 9, the morning after the transition. Raw ms subtraction shifts every earlier
    // bucket back an hour, which drops 2026-03-08 out of the window entirely and pulls 2026-03-02
    // in instead — a day of the user's focus time silently vanishing from the chart.
    const now = new Date(2026, 2, 9, 0, 30, 0);
    const result = getWeeklyFocus({ '2026-03-08': 90 * 60_000 }, now);
    const keys = result.map((d) => d.dateKey);

    expect(keys).toEqual([
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);
    expect(new Set(keys).size).toBe(7);
    expect(result.find((d) => d.dateKey === '2026-03-08')?.focusMs).toBe(90 * 60_000);
    expect(result.reduce((sum, d) => sum + d.focusMs, 0)).toBe(90 * 60_000);
  });

  it('fall-back: the 25h day appears exactly once, not twice', () => {
    expect(midnightSpanHours('2026-11-01', '2026-11-02')).toBe(25);

    // 23:30 on November 2, the night after the transition. Raw ms subtraction shifts every earlier
    // bucket forward an hour, which emits 2026-11-01 twice and drops 2026-10-27 — the same day's
    // focus time counted into two bars.
    const now = new Date(2026, 10, 2, 23, 30, 0);
    const result = getWeeklyFocus({ '2026-11-01': 30 * 60_000, '2026-10-27': 10 * 60_000 }, now);
    const keys = result.map((d) => d.dateKey);

    expect(keys).toEqual([
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(new Set(keys).size).toBe(7);
    expect(keys.filter((k) => k === '2026-11-01')).toHaveLength(1);
    expect(result.reduce((sum, d) => sum + d.focusMs, 0)).toBe(40 * 60_000);
  });

  it('still attributes a session logged late at night on the spring-forward day to that day', () => {
    // The trivial i=0 bucket, kept for the `isToday`/`weekday` pairing on a transition day rather
    // than for DST discrimination — the two tests above are what actually exercise the shift.
    const now = new Date(2026, 2, 8, 23, 30, 0);
    const result = getWeeklyFocus({ '2026-03-08': 42 }, now);
    expect(result[6]).toEqual({ dateKey: '2026-03-08', focusMs: 42, isToday: true, weekday: 0 });
  });
});

describe('getTodayFocusMs', () => {
  it('reads back the bucket keyed to the local date, matching toLocalDateString', () => {
    const now = new Date(2026, 0, 5, 9, 0, 0);
    expect(getTodayFocusMs({ '2026-01-05': 12_345 }, now)).toBe(12_345);
  });

  it('returns 0 when today has no recorded focus time yet', () => {
    const now = new Date(2026, 0, 5, 9, 0, 0);
    expect(getTodayFocusMs({ '2026-01-04': 5_000 }, now)).toBe(0);
  });

  it('does not fall back to a UTC day near local midnight', () => {
    const now = new Date(2026, 0, 5, 23, 59, 0); // 11:59pm local, Jan 5
    expect(getTodayFocusMs({ '2026-01-05': 7_000, '2026-01-06': 999 }, now)).toBe(7_000);
  });
});
