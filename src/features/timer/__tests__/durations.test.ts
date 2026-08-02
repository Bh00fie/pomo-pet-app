import { TIMER } from '@/config';
import {
  clampSessionMinutes,
  isAtSessionBound,
  minutesToMs,
  msToMinutes,
  stepSessionMinutes,
} from '../durations';

describe('minute/ms conversion', () => {
  it('round-trips whole minutes', () => {
    expect(minutesToMs(25)).toBe(1_500_000);
    expect(msToMinutes(1_500_000)).toBe(25);
    expect(msToMinutes(minutesToMs(5))).toBe(5);
  });
});

describe('clampSessionMinutes', () => {
  it('keeps values inside the supported range', () => {
    expect(clampSessionMinutes(25)).toBe(25);
    expect(clampSessionMinutes(TIMER.minMinutes - 1)).toBe(TIMER.minMinutes);
    expect(clampSessionMinutes(TIMER.maxMinutes + 100)).toBe(TIMER.maxMinutes);
    expect(clampSessionMinutes(0)).toBe(TIMER.minMinutes);
    expect(clampSessionMinutes(-30)).toBe(TIMER.minMinutes);
  });

  it('falls back to the minimum for unusable input instead of throwing', () => {
    expect(clampSessionMinutes(NaN)).toBe(TIMER.minMinutes);
    expect(clampSessionMinutes(Infinity)).toBe(TIMER.minMinutes);
  });

  it('rounds fractional minutes', () => {
    expect(clampSessionMinutes(25.4)).toBe(25);
    expect(clampSessionMinutes(25.6)).toBe(26);
  });
});

describe('stepSessionMinutes', () => {
  it('moves by one step in each direction', () => {
    expect(stepSessionMinutes(25, 1)).toBe(25 + TIMER.stepMinutes);
    expect(stepSessionMinutes(25, -1)).toBe(25 - TIMER.stepMinutes);
  });

  it('cannot step outside the range', () => {
    expect(stepSessionMinutes(TIMER.maxMinutes, 1)).toBe(TIMER.maxMinutes);
    expect(stepSessionMinutes(TIMER.minMinutes, -1)).toBe(TIMER.minMinutes);
  });
});

describe('isAtSessionBound', () => {
  it('flags the ends of the range so the controls can disable', () => {
    expect(isAtSessionBound(TIMER.minMinutes, -1)).toBe(true);
    expect(isAtSessionBound(TIMER.minMinutes, 1)).toBe(false);
    expect(isAtSessionBound(TIMER.maxMinutes, 1)).toBe(true);
    expect(isAtSessionBound(TIMER.maxMinutes, -1)).toBe(false);
    expect(isAtSessionBound(25, 1)).toBe(false);
    expect(isAtSessionBound(25, -1)).toBe(false);
  });
});
