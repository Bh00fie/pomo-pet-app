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
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    // America/New_York observes DST; the exact transition dates below are specific to it.
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('spring-forward: a 23-hour local day still counts as exactly one calendar day', () => {
    // 2026-03-08 02:00 -> 03:00 is the US spring-forward transition in America/New_York.
    const before = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 5,
      longestStreak: 5,
      now: new Date(2026, 2, 7, 10, 0, 0), // March 7, 10:00 local
    });
    const after = applyCompletedSessionToStreak({
      ...before,
      currentStreak: 5,
      now: new Date(2026, 2, 8, 10, 0, 0), // March 8, 10:00 local — 23h of wall-clock time later
    });
    expect(after.currentStreak).toBe(6);
    expect(after.lastCompletedLocalDate).toBe('2026-03-08');
  });

  it('fall-back: a 25-hour local day still counts as exactly one calendar day', () => {
    // 2026-11-01 02:00 -> 01:00 is the US fall-back transition in America/New_York.
    const before = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 5,
      longestStreak: 5,
      now: new Date(2026, 9, 31, 10, 0, 0), // Oct 31, 10:00 local
    });
    const after = applyCompletedSessionToStreak({
      ...before,
      currentStreak: 5,
      now: new Date(2026, 10, 1, 10, 0, 0), // Nov 1, 10:00 local — 25h of wall-clock time later
    });
    expect(after.currentStreak).toBe(6);
    expect(after.lastCompletedLocalDate).toBe('2026-11-01');
  });

  it('a genuine two-day gap spanning a DST transition still resets the streak', () => {
    const before = applyCompletedSessionToStreak({
      lastCompletedLocalDate: null,
      currentStreak: 5,
      longestStreak: 5,
      now: new Date(2026, 2, 6, 10, 0, 0), // March 6
    });
    const after = applyCompletedSessionToStreak({
      ...before,
      currentStreak: 5,
      now: new Date(2026, 2, 8, 10, 0, 0), // March 8 — two calendar days later, spanning the DST jump
    });
    expect(after.currentStreak).toBe(1);
  });
});
