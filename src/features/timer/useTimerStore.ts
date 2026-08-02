/**
 * Transient store for the running timer.
 *
 * Deliberately *not* persisted and separate from `src/store` (which owns the durable slice):
 * an in-flight session is runtime state, and the notification identifier that shadows it is
 * meaningless across launches. The state itself is produced only by `machine.transition` — this
 * layer adds nothing but side effects (scheduling/cancelling the end-of-session notification)
 * and resolution of session lengths from user settings.
 */
import { create } from 'zustand';

import { ACCOUNTABILITY, TIMER } from '@/config';
import { useAppStore } from '@/store';
import { minutesToMs } from './durations';
import {
  createTimerState,
  transition,
  type TimerEvent,
  type TimerMode,
  type TimerState,
} from './machine';
import { cancelSessionEndNotification, scheduleSessionEndNotification } from './notifications';

interface TimerStore {
  timer: TimerState;
  /** Identifier of the notification currently scheduled for `timer.endsAt`, if any. */
  notificationId: string | null;
  /**
   * Wall-clock ms at which the app last transitioned to `background` while a session was
   * `running` (docs/PLAN.md M4). An absolute timestamp, exactly like `endsAt` — never a
   * `setTimeout` trusted to fire while backgrounded, that's the exact M1 lesson this reuses.
   * `null` whenever there is no open background excursion to resolve.
   */
  backgroundedAt: number | null;
  /**
   * Bumped exactly once each time `resolveForeground` auto-abandons a still-running session for
   * having stayed backgrounded past `ACCOUNTABILITY.backgroundGraceMs` — never for a manual
   * "Give up", and never when the session had already legitimately finished while backgrounded.
   * `useLeaveEarlyPenalty` watches this (not `timer.status === 'abandoned'`, which both paths
   * produce) to know specifically when to sicken a fish.
   */
  lastPenaltyToken: number;

  dispatch: (event: TimerEvent) => void;
  start: (options?: { mode?: TimerMode; durationMs?: number }) => void;
  pause: () => void;
  resume: () => void;
  reset: (options?: { mode?: TimerMode }) => void;
  abandon: () => void;
  /** Fold the clock in; completes the session if `endsAt` has passed. */
  tick: (now?: number) => void;
  /** While idle, keep the shown length in step with the user's configured work/break minutes. */
  syncFromSettings: () => void;
  /** Call on an `AppState` transition to `'background'` while `running` (docs/PLAN.md M4).
   *  Records the absolute timestamp; a no-op if not running or an excursion is already open. */
  noteBackgrounded: (now?: number) => void;
  /**
   * Call on an `AppState` transition to `'active'` (docs/PLAN.md M4). Always folds the wall
   * clock in first — a session whose `endsAt` had already passed while backgrounded is a normal
   * completion no matter how long the app was away, exactly the M1 "you can lock your phone"
   * flow. Only if the session is *still* `running` after that, and the backgrounded excursion
   * exceeded `ACCOUNTABILITY.backgroundGraceMs`, does it auto-abandon and bump
   * `lastPenaltyToken`.
   */
  resolveForeground: (now?: number) => void;
}

/** Session length for a mode, straight from user settings. */
export function durationMsForMode(mode: TimerMode): number {
  const { settings } = useAppStore.getState();
  const minutes = mode === 'focus' ? settings.workMinutes : settings.shortBreakMinutes;
  return minutesToMs(minutes);
}

/**
 * Guards against an out-of-order schedule winning: each notification sync claims a token, and a
 * late-resolving schedule whose token has been superseded cancels itself instead of being kept.
 */
let syncToken = 0;

export const useTimerStore = create<TimerStore>()((set, get) => {
  async function syncNotification(next: TimerState): Promise<void> {
    const token = ++syncToken;

    const previousId = get().notificationId;
    if (previousId) {
      set({ notificationId: null });
      await cancelSessionEndNotification(previousId);
    }

    if (next.status !== 'running' || next.endsAt === null) return;
    if (!useAppStore.getState().settings.notificationsEnabled) return;

    const id = await scheduleSessionEndNotification({ mode: next.mode, endsAt: next.endsAt });
    if (token !== syncToken || get().timer.endsAt !== next.endsAt) {
      // Superseded while we were awaiting — the newer sync owns the schedule now.
      await cancelSessionEndNotification(id);
      return;
    }
    set({ notificationId: id });
  }

  return {
    timer: createTimerState('focus', minutesToMs(TIMER.defaultWorkMinutes)),
    notificationId: null,
    backgroundedAt: null,
    lastPenaltyToken: 0,

    dispatch: (event) => {
      const before = get().timer;
      const next = transition(before, event);
      // `transition` returns the same reference for no-op events; skip the render and the effect.
      if (next === before) return;

      set({ timer: next });

      const scheduleChanged = next.endsAt !== before.endsAt || next.status !== before.status;
      if (scheduleChanged) void syncNotification(next);
    },

    start: (options) => {
      const mode = options?.mode ?? get().timer.mode;
      const durationMs = options?.durationMs ?? durationMsForMode(mode);
      get().dispatch({ type: 'START', now: Date.now(), mode, durationMs });
    },

    pause: () => get().dispatch({ type: 'PAUSE', now: Date.now() }),
    resume: () => get().dispatch({ type: 'RESUME', now: Date.now() }),
    abandon: () => get().dispatch({ type: 'ABANDON', now: Date.now() }),
    tick: (now) => get().dispatch({ type: 'TICK', now: now ?? Date.now() }),

    reset: (options) => {
      const mode = options?.mode ?? get().timer.mode;
      get().dispatch({ type: 'RESET', mode, durationMs: durationMsForMode(mode) });
    },

    syncFromSettings: () => {
      const { timer } = get();
      // Only idle. A finished session keeps its own length on screen until the user moves on,
      // and an in-flight one must never be re-lengthed under the user's feet.
      if (timer.status !== 'idle') return;
      const durationMs = durationMsForMode(timer.mode);
      if (durationMs === timer.durationMs) return;
      get().dispatch({ type: 'RESET', mode: timer.mode, durationMs });
    },

    noteBackgrounded: (now = Date.now()) => {
      const { timer, backgroundedAt } = get();
      // Only a running session can be left early; an already-open excursion is not overwritten
      // (a background->inactive->background blip inside one excursion should not reset the
      // clock the grace period is measured from). Focus only — stepping away during a break is
      // the whole point of a break, never a penalty.
      if (timer.status !== 'running' || timer.mode !== 'focus' || backgroundedAt !== null) return;
      set({ backgroundedAt: now });
    },

    resolveForeground: (now = Date.now()) => {
      const { backgroundedAt } = get();

      // Always fold the clock in first, exactly like the plain foreground tick from M1 — if the
      // session's own `endsAt` had already passed while backgrounded, that is a normal
      // completion no matter how long the excursion was, never a penalty.
      get().dispatch({ type: 'TICK', now });

      if (backgroundedAt === null) return;
      set({ backgroundedAt: null });

      const elapsed = now - backgroundedAt;
      if (elapsed <= ACCOUNTABILITY.backgroundGraceMs) return;

      // If the tick above already completed (or the user somehow paused/reset/abandoned) the
      // session, there is nothing left to penalize — only a session still `running` after the
      // reconcile counts as "left early".
      if (get().timer.status !== 'running') return;

      get().dispatch({ type: 'ABANDON', now });
      set((s) => ({ lastPenaltyToken: s.lastPenaltyToken + 1 }));
    },
  };
});
