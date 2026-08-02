import {
  createTimerState,
  elapsedMs,
  formatClock,
  isActive,
  progress,
  reconcile,
  remainingMs,
  transition,
  type TimerState,
} from '../machine';

const MINUTE = 60_000;
const FOCUS = 25 * MINUTE;
const T0 = 1_700_000_000_000; // fixed epoch — every test drives its own clock explicitly

const idle = (durationMs = FOCUS) => createTimerState('focus', durationMs);

const started = (now = T0, durationMs = FOCUS): TimerState =>
  transition(idle(durationMs), { type: 'START', now });

describe('createTimerState', () => {
  it('starts idle with the full duration and no timestamps', () => {
    expect(idle()).toEqual({
      status: 'idle',
      mode: 'focus',
      endsAt: null,
      durationMs: FOCUS,
      pausedRemainingMs: null,
    });
  });
});

describe('idle → running', () => {
  it('sets endsAt to now + duration rather than a counter', () => {
    const state = started();
    expect(state.status).toBe('running');
    expect(state.endsAt).toBe(T0 + FOCUS);
    expect(state.pausedRemainingMs).toBeNull();
    expect(remainingMs(state, T0)).toBe(FOCUS);
  });

  it('accepts a mode and duration override on START', () => {
    const state = transition(idle(), { type: 'START', now: T0, mode: 'break', durationMs: 5 * MINUTE });
    expect(state.mode).toBe('break');
    expect(state.durationMs).toBe(5 * MINUTE);
    expect(state.endsAt).toBe(T0 + 5 * MINUTE);
  });

  it('refuses a non-positive or non-finite duration', () => {
    const base = idle();
    expect(transition(base, { type: 'START', now: T0, durationMs: 0 })).toBe(base);
    expect(transition(base, { type: 'START', now: T0, durationMs: -1 })).toBe(base);
    expect(transition(base, { type: 'START', now: T0, durationMs: NaN })).toBe(base);
  });

  it('ignores START while already running so a run is never silently discarded', () => {
    const running = started();
    expect(transition(running, { type: 'START', now: T0 + 1000 })).toBe(running);
  });

  it('can be started again from completed or abandoned', () => {
    const completed = transition(started(), { type: 'TICK', now: T0 + FOCUS });
    const restarted = transition(completed, { type: 'START', now: T0 + FOCUS + 1000 });
    expect(restarted.status).toBe('running');
    expect(restarted.endsAt).toBe(T0 + FOCUS + 1000 + FOCUS);
    expect(restarted.pausedRemainingMs).toBeNull();

    const abandoned = transition(started(), { type: 'ABANDON', now: T0 + MINUTE });
    expect(transition(abandoned, { type: 'START', now: T0 + 2 * MINUTE }).status).toBe('running');
  });
});

describe('running → paused', () => {
  it('freezes the exact remaining time and drops endsAt', () => {
    const paused = transition(started(), { type: 'PAUSE', now: T0 + 10 * MINUTE });
    expect(paused.status).toBe('paused');
    expect(paused.endsAt).toBeNull();
    expect(paused.pausedRemainingMs).toBe(15 * MINUTE);
  });

  it('holds remaining time steady no matter how long the pause lasts', () => {
    const paused = transition(started(), { type: 'PAUSE', now: T0 + 10 * MINUTE });
    expect(remainingMs(paused, T0 + 10 * MINUTE)).toBe(15 * MINUTE);
    expect(remainingMs(paused, T0 + 60 * MINUTE)).toBe(15 * MINUTE);
    expect(remainingMs(paused, T0 + 86_400_000)).toBe(15 * MINUTE);
  });

  it('is a no-op from idle, paused, completed and abandoned', () => {
    const base = idle();
    expect(transition(base, { type: 'PAUSE', now: T0 })).toBe(base);

    const paused = transition(started(), { type: 'PAUSE', now: T0 + MINUTE });
    expect(transition(paused, { type: 'PAUSE', now: T0 + 2 * MINUTE })).toBe(paused);

    const completed = transition(started(), { type: 'TICK', now: T0 + FOCUS });
    expect(transition(completed, { type: 'PAUSE', now: T0 + FOCUS })).toBe(completed);

    const abandoned = transition(started(), { type: 'ABANDON', now: T0 + MINUTE });
    expect(transition(abandoned, { type: 'PAUSE', now: T0 + MINUTE })).toBe(abandoned);
  });

  it('completes instead of pausing when the session already ran out', () => {
    const late = transition(started(), { type: 'PAUSE', now: T0 + FOCUS + 5_000 });
    expect(late.status).toBe('completed');
    expect(remainingMs(late, T0 + FOCUS + 5_000)).toBe(0);
  });
});

describe('paused → running', () => {
  it('resumes with exactly the remaining time, rebased on the resume moment', () => {
    const paused = transition(started(), { type: 'PAUSE', now: T0 + 10 * MINUTE });
    const resumeAt = T0 + 45 * MINUTE; // 35 minutes spent paused
    const resumed = transition(paused, { type: 'RESUME', now: resumeAt });

    expect(resumed.status).toBe('running');
    expect(resumed.pausedRemainingMs).toBeNull();
    expect(resumed.endsAt).toBe(resumeAt + 15 * MINUTE);
    expect(remainingMs(resumed, resumeAt)).toBe(15 * MINUTE);
  });

  it('survives many pause/resume cycles without drifting a single millisecond', () => {
    let state = started();
    let clock = T0;
    let served = 0;

    for (let i = 0; i < 12; i += 1) {
      const runFor = 37_123; // deliberately not a round number
      clock += runFor;
      served += runFor;
      state = transition(state, { type: 'PAUSE', now: clock });
      expect(state.status).toBe('paused');
      clock += 500_000; // an arbitrarily long pause contributes nothing
      state = transition(state, { type: 'RESUME', now: clock });
    }

    expect(remainingMs(state, clock)).toBe(FOCUS - served);
    expect(elapsedMs(state, clock)).toBe(served);
  });

  it('is a no-op unless paused', () => {
    const running = started();
    expect(transition(running, { type: 'RESUME', now: T0 + MINUTE })).toBe(running);
    const base = idle();
    expect(transition(base, { type: 'RESUME', now: T0 })).toBe(base);
  });

  it('completes rather than resuming when nothing is left', () => {
    const zeroed: TimerState = {
      status: 'paused',
      mode: 'focus',
      endsAt: null,
      durationMs: FOCUS,
      pausedRemainingMs: 0,
    };
    expect(transition(zeroed, { type: 'RESUME', now: T0 }).status).toBe('completed');
  });
});

describe('running → completed', () => {
  it('does not complete one millisecond early', () => {
    const running = started();
    const almost = transition(running, { type: 'TICK', now: T0 + FOCUS - 1 });
    expect(almost).toBe(running);
    expect(remainingMs(almost, T0 + FOCUS - 1)).toBe(1);
  });

  it('completes exactly at the boundary', () => {
    const completed = transition(started(), { type: 'TICK', now: T0 + FOCUS });
    expect(completed.status).toBe('completed');
    expect(completed.endsAt).toBe(T0 + FOCUS);
    expect(remainingMs(completed, T0 + FOCUS)).toBe(0);
    expect(elapsedMs(completed, T0 + FOCUS)).toBe(FOCUS);
    expect(progress(completed, T0 + FOCUS)).toBe(1);
  });

  it('completes when the app was backgrounded straight past the end', () => {
    // No ticks happen while backgrounded; the first foreground read must settle it.
    const running = started();
    const returned = reconcile(running, T0 + FOCUS + 42 * MINUTE);
    expect(returned.status).toBe('completed');
    expect(remainingMs(returned, T0 + FOCUS + 42 * MINUTE)).toBe(0);
  });

  it('reports correct remaining time after a long background gap that did not reach the end', () => {
    const running = started();
    const backFrom = T0 + 20 * MINUTE;
    expect(reconcile(running, backFrom)).toBe(running);
    expect(remainingMs(running, backFrom)).toBe(5 * MINUTE);
  });

  it('stays completed under further ticks', () => {
    const completed = transition(started(), { type: 'TICK', now: T0 + FOCUS });
    expect(transition(completed, { type: 'TICK', now: T0 + FOCUS + 10_000 })).toBe(completed);
  });
});

describe('→ abandoned', () => {
  it('freezes remaining time so elapsed focus stays derivable', () => {
    const abandoned = transition(started(), { type: 'ABANDON', now: T0 + 4 * MINUTE });
    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.endsAt).toBeNull();
    expect(abandoned.pausedRemainingMs).toBe(21 * MINUTE);
    expect(elapsedMs(abandoned, T0 + 90 * MINUTE)).toBe(4 * MINUTE);
  });

  it('can abandon from paused, keeping the paused remainder', () => {
    const paused = transition(started(), { type: 'PAUSE', now: T0 + 3 * MINUTE });
    const abandoned = transition(paused, { type: 'ABANDON', now: T0 + 30 * MINUTE });
    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.pausedRemainingMs).toBe(22 * MINUTE);
  });

  it('is a no-op from idle and completed', () => {
    const base = idle();
    expect(transition(base, { type: 'ABANDON', now: T0 })).toBe(base);
    const completed = transition(started(), { type: 'TICK', now: T0 + FOCUS });
    expect(transition(completed, { type: 'ABANDON', now: T0 + FOCUS })).toBe(completed);
  });
});

describe('RESET', () => {
  it('returns to idle from every status', () => {
    const running = started();
    const paused = transition(running, { type: 'PAUSE', now: T0 + MINUTE });
    const completed = transition(running, { type: 'TICK', now: T0 + FOCUS });
    const abandoned = transition(running, { type: 'ABANDON', now: T0 + MINUTE });

    for (const state of [idle(), running, paused, completed, abandoned]) {
      const reset = transition(state, { type: 'RESET' });
      expect(reset).toEqual(createTimerState('focus', FOCUS));
    }
  });

  it('can reconfigure mode and duration on the way back to idle', () => {
    const reset = transition(started(), { type: 'RESET', mode: 'break', durationMs: 5 * MINUTE });
    expect(reset).toEqual(createTimerState('break', 5 * MINUTE));
    expect(remainingMs(reset, T0 + 999 * MINUTE)).toBe(5 * MINUTE);
  });
});

describe('edge cases', () => {
  it('pausing in the same millisecond as starting keeps the whole duration', () => {
    const paused = transition(started(), { type: 'PAUSE', now: T0 });
    expect(paused.pausedRemainingMs).toBe(FOCUS);
    const resumed = transition(paused, { type: 'RESUME', now: T0 + 10 * MINUTE });
    expect(remainingMs(resumed, T0 + 10 * MINUTE)).toBe(FOCUS);
    expect(elapsedMs(resumed, T0 + 10 * MINUTE)).toBe(0);
  });

  it('never reports negative remaining time even if a tick is missed past the end', () => {
    const running = started();
    expect(remainingMs(running, T0 + FOCUS + 10 * MINUTE)).toBe(0);
    expect(progress(running, T0 + FOCUS + 10 * MINUTE)).toBe(1);
  });

  it('tolerates a clock that jumps backwards without exceeding the duration', () => {
    const running = started();
    expect(remainingMs(running, T0 - 5 * MINUTE)).toBe(FOCUS + 5 * MINUTE);
    expect(elapsedMs(running, T0 - 5 * MINUTE)).toBe(0);
    expect(progress(running, T0 - 5 * MINUTE)).toBe(0);
  });

  it('progress is 0 for an unusable duration instead of NaN', () => {
    const broken: TimerState = { ...idle(), durationMs: 0 };
    expect(progress(broken, T0)).toBe(0);
  });

  it('isActive covers exactly running and paused', () => {
    const running = started();
    expect(isActive(idle())).toBe(false);
    expect(isActive(running)).toBe(true);
    expect(isActive(transition(running, { type: 'PAUSE', now: T0 + MINUTE }))).toBe(true);
    expect(isActive(transition(running, { type: 'TICK', now: T0 + FOCUS }))).toBe(false);
    expect(isActive(transition(running, { type: 'ABANDON', now: T0 + MINUTE }))).toBe(false);
  });
});

describe('formatClock', () => {
  it('rounds up so a fresh timer shows its full length', () => {
    expect(formatClock(25 * MINUTE)).toBe('25:00');
    expect(formatClock(25 * MINUTE - 1)).toBe('25:00');
    expect(formatClock(24 * MINUTE + 59_001)).toBe('25:00');
  });

  it('only reads 00:00 when nothing is left', () => {
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5_000)).toBe('00:00');
  });

  it('pads both fields', () => {
    expect(formatClock(9_000)).toBe('00:09');
    expect(formatClock(5 * MINUTE)).toBe('05:00');
    expect(formatClock(90 * MINUTE)).toBe('90:00');
  });
});
