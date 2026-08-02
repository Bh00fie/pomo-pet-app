/**
 * The timer state machine — pure TypeScript.
 *
 * **This file must not import React, React Native, or Expo.** It has no imports at all by
 * design: every function here is a pure `(state, event) => state` or `(state, now) => value`,
 * so the whole engine is unit-testable with a fake clock and no renderer or device.
 *
 * Time is always *absolute*. A running timer is an `endsAt` wall-clock timestamp, never a
 * decrementing counter: JS intervals are throttled or killed when the app is backgrounded, so
 * anything that counts down in a loop drifts or freezes. Remaining time is recomputed from
 * `Date.now()` vs `endsAt` on every read, which makes backgrounding a non-event.
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed' | 'abandoned';

export type TimerMode = 'focus' | 'break';

export interface TimerState {
  status: TimerStatus;
  mode: TimerMode;
  /**
   * Wall-clock ms at which the session ends. Set while `running`; kept after `completed` so
   * consumers know *when* it finished. Null in `idle`, `paused` and `abandoned`, where there is
   * no scheduled end.
   */
  endsAt: number | null;
  /** Full configured length of the current session. */
  durationMs: number;
  /**
   * Remaining ms frozen at the moment the run stopped — set on `paused` (resume restores it
   * exactly), on `abandoned` (so elapsed time is still derivable), and 0 on `completed`.
   * Null while `idle`/`running`, where remaining time comes from `durationMs`/`endsAt`.
   */
  pausedRemainingMs: number | null;
}

export type TimerEvent =
  /** Begin a fresh session. Ignored while already running — use RESUME to un-pause. */
  | { type: 'START'; now: number; mode?: TimerMode; durationMs?: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  /** Clock check: completes the session if `now` has reached `endsAt`. Otherwise a no-op. */
  | { type: 'TICK'; now: number }
  /** User gave up (or the accountability rule fired). Terminal, like `completed`. */
  | { type: 'ABANDON'; now: number }
  /** Back to `idle`, optionally reconfigured. Valid from any status. */
  | { type: 'RESET'; mode?: TimerMode; durationMs?: number };

const isValidDuration = (ms: number): boolean => Number.isFinite(ms) && ms > 0;

/** A fresh `idle` state for the given mode and length. */
export function createTimerState(mode: TimerMode, durationMs: number): TimerState {
  return {
    status: 'idle',
    mode,
    endsAt: null,
    durationMs,
    pausedRemainingMs: null,
  };
}

/**
 * The single transition function. Invalid transitions return the *same object reference*, so
 * callers (and zustand) can skip no-op updates cheaply.
 */
export function transition(state: TimerState, event: TimerEvent): TimerState {
  switch (event.type) {
    case 'START': {
      // Restarting a run mid-flight would silently discard it; the caller must RESET first.
      if (state.status === 'running') return state;
      const mode = event.mode ?? state.mode;
      const durationMs = event.durationMs ?? state.durationMs;
      if (!isValidDuration(durationMs)) return state;
      return {
        status: 'running',
        mode,
        durationMs,
        endsAt: event.now + durationMs,
        pausedRemainingMs: null,
      };
    }

    case 'PAUSE': {
      if (state.status !== 'running' || state.endsAt === null) return state;
      const remaining = state.endsAt - event.now;
      // Pausing at or past the boundary can't rewind time — the session already finished.
      if (remaining <= 0) return complete(state);
      return { ...state, status: 'paused', endsAt: null, pausedRemainingMs: remaining };
    }

    case 'RESUME': {
      if (state.status !== 'paused' || state.pausedRemainingMs === null) return state;
      if (state.pausedRemainingMs <= 0) return complete({ ...state, endsAt: event.now });
      return {
        ...state,
        status: 'running',
        endsAt: event.now + state.pausedRemainingMs,
        pausedRemainingMs: null,
      };
    }

    case 'TICK': {
      if (state.status !== 'running' || state.endsAt === null) return state;
      if (event.now < state.endsAt) return state;
      return complete(state);
    }

    case 'ABANDON': {
      if (state.status !== 'running' && state.status !== 'paused') return state;
      return {
        ...state,
        status: 'abandoned',
        endsAt: null,
        pausedRemainingMs: remainingMs(state, event.now),
      };
    }

    case 'RESET':
      return createTimerState(event.mode ?? state.mode, event.durationMs ?? state.durationMs);

    default:
      return state;
  }
}

/** Completed keeps `endsAt` (the moment it finished) and pins remaining at exactly 0. */
function complete(state: TimerState): TimerState {
  return { ...state, status: 'completed', pausedRemainingMs: 0 };
}

/**
 * Fold a clock reading into the state. Called on every tick and whenever the app returns to the
 * foreground — this is what makes a session that ended while backgrounded show up as completed.
 */
export function reconcile(state: TimerState, now: number): TimerState {
  return transition(state, { type: 'TICK', now });
}

/** Ms left in the session, never negative. Derived — never stored. */
export function remainingMs(state: TimerState, now: number): number {
  switch (state.status) {
    case 'running':
      return state.endsAt === null ? 0 : Math.max(0, state.endsAt - now);
    case 'paused':
    case 'abandoned':
      return Math.max(0, state.pausedRemainingMs ?? 0);
    case 'completed':
      return 0;
    case 'idle':
    default:
      return state.durationMs;
  }
}

/** Ms of the session actually served so far. */
export function elapsedMs(state: TimerState, now: number): number {
  return Math.max(0, Math.min(state.durationMs, state.durationMs - remainingMs(state, now)));
}

/** 0…1 completion fraction, for progress rings and bars. */
export function progress(state: TimerState, now: number): number {
  if (!isValidDuration(state.durationMs)) return 0;
  return elapsedMs(state, now) / state.durationMs;
}

/** True while a session is in flight (running or paused) — i.e. abandoning is meaningful. */
export function isActive(state: TimerState): boolean {
  return state.status === 'running' || state.status === 'paused';
}

/**
 * `MM:SS` for display. Rounds *up*, so a fresh 25:00 timer reads "25:00" for its first second
 * and only reads "00:00" when there is genuinely nothing left.
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
