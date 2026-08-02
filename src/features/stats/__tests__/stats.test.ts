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
  it('runs in the DST-observing zone these dates depend on', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  });

  it('produces exactly 7 distinct, correctly-ordered calendar days across the spring-forward week', () => {
    // 2026-03-08 is the US spring-forward transition (a 23h local day). A window ending on it must
    // still produce 7 distinct calendar day keys in order, not a duplicate or a skipped day from
    // ms-based arithmetic drifting across the short day.
    const now = new Date(2026, 2, 8, 12, 0, 0);
    const result = getWeeklyFocus({}, now);
    const keys = result.map((d) => d.dateKey);
    expect(keys).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
    expect(new Set(keys).size).toBe(7);
  });

  it('produces exactly 7 distinct, correctly-ordered calendar days across the fall-back week', () => {
    // 2026-11-01 is the US fall-back transition (a 25h local day).
    const now = new Date(2026, 10, 1, 12, 0, 0);
    const result = getWeeklyFocus({}, now);
    const keys = result.map((d) => d.dateKey);
    expect(keys).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(new Set(keys).size).toBe(7);
  });

  it('still attributes a session logged late at night on the spring-forward day to that day', () => {
    // A local time of 23:30 on the short day — a UTC-instant-based bucketing scheme is exactly
    // the kind of thing that mis-keys near a DST boundary; this stays local-field-based.
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
