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

import { TIMER } from '@/config';
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
  };
});
