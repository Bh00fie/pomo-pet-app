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
   * "Give up", and never for an excursion that stayed *within* the grace period. A session whose
   * `endsAt` passed while away is **not** exempt: sustained backgrounding penalizes regardless.
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
  /**
   * Fold the clock in; completes the session if `endsAt` has passed. Suppressed entirely while a
   * background excursion is open — `resolveForeground` owns that decision, see below.
   */
  tick: (now?: number) => void;
  /** While idle, keep the shown length in step with the user's configured work/break minutes. */
  syncFromSettings: () => void;
  /** Call on an `AppState` transition to `'background'` while `running` (docs/PLAN.md M4).
   *  Records the absolute timestamp; a no-op if not running or an excursion is already open. */
  noteBackgrounded: (now?: number) => void;
  /**
   * Call on an `AppState` transition to `'active'` (docs/PLAN.md M4). Checks the excursion
   * length *first*: if the app was backgrounded past `ACCOUNTABILITY.backgroundGraceMs`, the
   * session is always auto-abandoned and `lastPenaltyToken` bumped — regardless of whether
   * `endsAt` also passed while away. Sustained backgrounding is what's punished; a timer that
   * also finished in the meantime is not an escape hatch. Only when the excursion was *within*
   * the grace period does it fold the wall clock in and let the session complete naturally if
   * `endsAt` passed during that short window.
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
    abandon: () => {
      // Only a running or paused session can actually be abandoned (see `machine.ts`'s ABANDON
      // guard) — check before dispatching so a stray call from an already-idle/terminal state
      // (the UI never offers "Give up" then) can't double-count. This is the manual-only path:
      // the auto-abandon path (`resolveForeground`) dispatches ABANDON directly, not through
      // here, and counts itself via `penalizeAbandonedSession` instead — so the two can never
      // double-increment the same abandonment.
      const wasActive = get().timer.status === 'running' || get().timer.status === 'paused';
      get().dispatch({ type: 'ABANDON', now: Date.now() });
      if (wasActive) useAppStore.getState().recordManualAbandon();
    },

    tick: (now) => {
      // While a background excursion is open, `resolveForeground` is the *only* thing allowed to
      // resolve the session — past the grace period it must abandon, not complete. `useTimer`'s
      // interval is a second, independent path to `completed`, and iOS can deliver an overdue
      // timer callback *before* the `AppState` `'active'` listener on resume; letting it through
      // would silently reinstate the escape hatch (session already `completed`, so
      // `resolveForeground` finds nothing running to penalize). This also matches what M1 always
      // assumed anyway: a backgrounded session is reconciled on return, not by a JS interval that
      // the OS has suspended. Deliberately here and not in `dispatch` — `resolveForeground`'s own
      // within-grace TICK is dispatched *after* it clears `backgroundedAt`, so it is unaffected.
      if (get().backgroundedAt !== null) return;
      get().dispatch({ type: 'TICK', now: now ?? Date.now() });
    },

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

      if (backgroundedAt === null) {
        // No open excursion for this foreground event — just the ordinary foreground tick (e.g.
        // completing a session whose `endsAt` passed without an interval firing to notice).
        get().dispatch({ type: 'TICK', now });
        return;
      }

      set({ backgroundedAt: null });
      const elapsed = now - backgroundedAt;

      if (elapsed > ACCOUNTABILITY.backgroundGraceMs) {
        // Sustained backgrounding is what's punished, and that takes priority over whether
        // `endsAt` also passed while away — a session backgrounded for its entire duration (or
        // longer) must still abandon+penalize, not complete+reward. Only a session still
        // `running` at this point can be abandoned.
        if (get().timer.status === 'running') {
          get().dispatch({ type: 'ABANDON', now });
          set((s) => ({ lastPenaltyToken: s.lastPenaltyToken + 1 }));
        }
        return;
      }

      // Within the grace period: fold the wall clock in, same as an ordinary foreground tick —
      // this is what completes a session whose `endsAt` passed during that short window (the M1
      // "you can lock your phone briefly" flow).
      get().dispatch({ type: 'TICK', now });
    },
  };
});
