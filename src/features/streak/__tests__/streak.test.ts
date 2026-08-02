import { applyCompletedSessionToStreak, toLocalDateString } from '../streak';

describe('toLocalDateString', () => {
  it('formats a local calendar date as YYYY-MM-DD', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 59, 0))).toBe('2026-01-05');
    expect(toLocalDateString(new Date(2026, 11, 31, 0, 1, 0))).toBe('2026-12-31');
  });
});

describe('applyCompletedSessionToStreak — basics', () => {
  it('starts a streak of 1 on the very first completed session', () => {
    const result = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 0,
      longestStreak: 0,
      now: new Date(2026, 0, 1, 9, 0, 0),
    });
    expect(result).toEqual({ currentStreak: 1, longestStreak: 1, lastCompletedLocalDate: '2026-01-01' });
  });

  it('leaves the streak unchanged for a second session on the same local day', () => {
    const result = applyCompletedSessionToStreak({
      lastCompletedLocalDate: '2026-01-05',
      currentStreak: 3,
      longestStreak: 5,
      now: new Date(2026, 0, 5, 22, 0, 0),
    });
    expect(result.currentStreak).toBe(3);
    expect(result.lastCompletedLocalDate).toBe('2026-01-05');
    expect(result.longestStreak).toBe(5);
  });

  it('never leaves a completed session on a zero streak, even from inconsistent stored state', () => {
    const result = applyCompletedSessionToStreak({
      lastCompletedLocalDate: '2026-01-05',
      currentStreak: 0, // "today already has a session" but the counter says zero
      longestStreak: 0,
      now: new Date(2026, 0, 5, 22, 0, 0),
    });
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it('extends the streak by one for exactly the next calendar day', () => {
    const result = applyCompletedSessionToStreak({
      lastCompletedLocalDate: '2026-01-05',
      currentStreak: 3,
      longestStreak: 5,
      now: new Date(2026, 0, 6, 8, 0, 0),
    });
    expect(result.currentStreak).toBe(4);
    expect(result.lastCompletedLocalDate).toBe('2026-01-06');
  });

  it('resets to 1 after a gap of two or more calendar days', () => {
    const result = applyCompletedSessionToStreak({
      lastCompletedLocalDate: '2026-01-05',
      currentStreak: 10,
      longestStreak: 10,
      now: new Date(2026, 0, 8, 8, 0, 0), // three days later
    });
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(10); // the record stands even though the run broke
  });

  it('tracks longestStreak as the running max, not just the latest value', () => {
    let stats = { lastCompletedLocalDate: null as string | null, currentStreak: 0, longestStreak: 0 };
    for (let day = 1; day <= 5; day += 1) {
      const result = applyCompletedSessionToStreak({ ...stats, now: new Date(2026, 1, day, 9, 0, 0) });
      stats = result;
    }
    expect(stats.currentStreak).toBe(5);
    expect(stats.longestStreak).toBe(5);

    // Break the streak, then rebuild a shorter one — longestStreak must not regress.
    const broken = applyCompletedSessionToStreak({ ...stats, now: new Date(2026, 1, 20, 9, 0, 0) });
    expect(broken.currentStreak).toBe(1);
    expect(broken.longestStreak).toBe(5);
  });

  it('resets rather than crashing on an out-of-order ("clock skew") session before the last one', () => {
    const result = applyCompletedSessionToStreak({
      lastCompletedLocalDate: '2026-01-10',
      currentStreak: 4,
      longestStreak: 4,
      now: new Date(2026, 0, 8, 9, 0, 0), // two days *before* the recorded last date
    });
    expect(result.currentStreak).toBe(1);
  });
});

describe('applyCompletedSessionToStreak — midnight-adjacent sessions', () => {
  it('counts a session at 23:59 followed by one at 00:01 the next day as one calendar day apart', () => {
    const first = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 0,
      longestStreak: 0,
      now: new Date(2026, 2, 10, 23, 59, 0),
    });
    expect(first.lastCompletedLocalDate).toBe('2026-03-10');

    // ~2 minutes of wall-clock time later, but the calendar day has rolled over.
    const second = applyCompletedSessionToStreak({ ...first, now: new Date(2026, 2, 11, 0, 1, 0) });
    expect(second.currentStreak).toBe(2);
    expect(second.lastCompletedLocalDate).toBe('2026-03-11');
  });

  it('~23h apart can be the same day or a different day depending on time of day', () => {
    // Same day: 01:00 and 23:00 on the same date are ~22h apart, same calendar day.
    const sameDayFirst = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 0,
      longestStreak: 0,
      now: new Date(2026, 3, 1, 1, 0, 0),
    });
    const sameDaySecond = applyCompletedSessionToStreak({
      ...sameDayFirst,
      now: new Date(2026, 3, 1, 23, 0, 0),
    });
    expect(sameDaySecond.currentStreak).toBe(1); // unchanged — still April 1st

    // Different day: 23:00 on day 1 and 22:00 on day 2 are ~23h apart, but cross midnight.
    const crossFirst = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 0,
      longestStreak: 0,
      now: new Date(2026, 3, 1, 23, 0, 0),
    });
    const crossSecond = applyCompletedSessionToStreak({
      ...crossFirst,
      now: new Date(2026, 3, 2, 22, 0, 0),
    });
    expect(crossSecond.currentStreak).toBe(2); // extended — April 2nd, one day later
  });
});

describe('applyCompletedSessionToStreak — DST transitions', () => {
  // The zone is pinned by `jest.config.js`, which sets it before Jest forks its workers —
  // assigning `process.env.TZ` from in here would be silently ignored and these tests would
  // degrade into ordinary 24h-day tests without failing. Assert it instead of assuming it.
  it('runs in the DST-observing zone these transition dates belong to', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  });

  /**
   * Ms between local midnight of two `YYYY-MM-DD` dates, computed the same way the streak code
   * does. Asserted on directly below so these tests can never silently go vacuous: the whole
   * point is a *midnight-to-midnight* span that is not 24h, and picking the wrong date pair
   * (e.g. the day before the transition rather than the day *of* it) yields a plain 24h day that
   * every naive implementation also passes.
   */
  function midnightSpanHours(fromDateStr: string, toDateStr: string): number {
    const [fy, fm, fd] = fromDateStr.split('-').map(Number);
    const [ty, tm, td] = toDateStr.split('-').map(Number);
    return (new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / 3_600_000;
  }

  it('spring-forward: a 23-hour local day still counts as exactly one calendar day', () => {
    // 2026-03-08 02:00 -> 03:00 is the US spring-forward transition. The short *day* is therefore
    // March 8 itself (midnight EST -> midnight EDT = 23h), NOT March 7 -> March 8, which is a
    // normal 24h span because the jump has not happened yet at midnight on the 8th.
    expect(midnightSpanHours('2026-03-08', '2026-03-09')).toBe(23);

    const before = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 5,
      longestStreak: 5,
      now: new Date(2026, 2, 8, 10, 0, 0), // March 8, 10:00 local (already EDT)
    });
    const after = applyCompletedSessionToStreak({
      ...before,
      currentStreak: 5,
      now: new Date(2026, 2, 9, 10, 0, 0), // March 9, 10:00 local
    });
    expect(after.currentStreak).toBe(6); // a `Math.floor` of 23/24 would say 0 and stall at 5
    expect(after.lastCompletedLocalDate).toBe('2026-03-09');
  });

  it('fall-back: a 25-hour local day still counts as exactly one calendar day', () => {
    // 2026-11-01 02:00 -> 01:00 is the US fall-back transition, so the long day is November 1
    // itself (midnight EDT -> midnight EST = 25h), not October 31 -> November 1.
    expect(midnightSpanHours('2026-11-01', '2026-11-02')).toBe(25);

    const before = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 5,
      longestStreak: 5,
      now: new Date(2026, 10, 1, 10, 0, 0), // Nov 1, 10:00 local (already EST)
    });
    const after = applyCompletedSessionToStreak({
      ...before,
      currentStreak: 5,
      now: new Date(2026, 10, 2, 10, 0, 0), // Nov 2, 10:00 local
    });
    expect(after.currentStreak).toBe(6);
    expect(after.lastCompletedLocalDate).toBe('2026-11-02');
  });

  it('a genuine two-day gap spanning a DST transition still resets the streak', () => {
    // 47h, not 48 — the spring-forward hour is inside this span, so a `Math.round` that absorbs
    // the shift must still land on 2 rather than collapsing it to 1.
    expect(midnightSpanHours('2026-03-07', '2026-03-09')).toBe(47);

    const before = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 5,
      longestStreak: 5,
      now: new Date(2026, 2, 7, 10, 0, 0), // March 7
    });
    const after = applyCompletedSessionToStreak({
      ...before,
      currentStreak: 5,
      now: new Date(2026, 2, 9, 10, 0, 0), // March 9 — two calendar days later, over the DST jump
    });
    expect(after.currentStreak).toBe(1);
  });

  it('the fall-back 25-hour day is not mistaken for two calendar days', () => {
    // The mirror-image failure of the spring-forward case: a `Math.ceil` (or a floor on a
    // 25h span read the other way) would call this 2 days and reset a live streak.
    const before = applyCompletedSessionToStreak({
      lastCompletedLocalDate: '2026-11-01',
      currentStreak: 9,
      longestStreak: 9,
      now: new Date(2026, 10, 2, 0, 30, 0), // Nov 2, 00:30 local — barely over midnight
    });
    expect(before.currentStreak).toBe(10);
  });
});
