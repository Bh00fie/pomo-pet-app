/**
 * React binding for the timer engine: the UI-facing surface (`start`/`pause`/`resume`/`reset`)
 * plus everything time-driven that has to live in an effect.
 *
 * The countdown shown on screen is recomputed from `endsAt` on every render — the interval below
 * only decides *how often* we re-render, it is never the source of the number. That is what makes
 * backgrounding harmless: on return we read the wall clock once and the display is already right.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { TIMER } from '@/config';
import { selectSettings, useAppStore } from '@/store';
import {
  elapsedMs as elapsedMsOf,
  formatClock,
  isActive as isActiveOf,
  progress as progressOf,
  remainingMs as remainingMsOf,
  type TimerMode,
  type TimerState,
  type TimerStatus,
} from './machine';
import { configureNotificationHandler } from './notifications';
import { useTimerStore } from './useTimerStore';

export interface UseTimerResult {
  state: TimerState;
  status: TimerStatus;
  mode: TimerMode;
  /** `MM:SS`, derived from `endsAt` — safe to render directly. */
  clock: string;
  remainingMs: number;
  elapsedMs: number;
  durationMs: number;
  /** 0…1, for progress bars/rings. */
  progress: number;
  isIdle: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isActive: boolean;
  isCompleted: boolean;
  isAbandoned: boolean;

  start: (mode?: TimerMode) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  abandon: () => void;
  /** Switch focus/break while idle; adopts that mode's configured length. */
  setMode: (mode: TimerMode) => void;
}

export function useTimer(): UseTimerResult {
  const timer = useTimerStore((s) => s.timer);
  const startSession = useTimerStore((s) => s.start);
  const pauseSession = useTimerStore((s) => s.pause);
  const resumeSession = useTimerStore((s) => s.resume);
  const resetSession = useTimerStore((s) => s.reset);
  const abandonSession = useTimerStore((s) => s.abandon);
  const tick = useTimerStore((s) => s.tick);
  const syncFromSettings = useTimerStore((s) => s.syncFromSettings);

  const settings = useAppStore(selectSettings);
  const [now, setNow] = useState(() => Date.now());

  // Foreground presentation of the scheduled notification. Idempotent, once per mount is fine.
  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // An idle timer always shows the currently configured length for its mode.
  useEffect(() => {
    syncFromSettings();
  }, [syncFromSettings, settings.workMinutes, settings.shortBreakMinutes, timer.status, timer.mode]);

  // Re-render cadence while running, plus the boundary check that completes the session.
  useEffect(() => {
    if (timer.status !== 'running' || timer.endsAt === null) return;

    const endsAt = timer.endsAt;
    setNow(Date.now());

    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) tick(current);
    }, TIMER.tickIntervalMs);

    return () => clearInterval(id);
  }, [timer.status, timer.endsAt, tick]);

  // Returning from the background: read the clock once. If the session ended while we were away,
  // this is what flips it to `completed` — the interval was not running to notice.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const current = Date.now();
      setNow(current);
      tick(current);
    });
    return () => subscription.remove();
  }, [tick]);

  const start = useCallback((mode?: TimerMode) => startSession(mode ? { mode } : undefined), [startSession]);
  const setMode = useCallback((mode: TimerMode) => resetSession({ mode }), [resetSession]);
  const reset = useCallback(() => resetSession(), [resetSession]);

  return useMemo(() => {
    const remainingMs = remainingMsOf(timer, now);
    return {
      state: timer,
      status: timer.status,
      mode: timer.mode,
      clock: formatClock(remainingMs),
      remainingMs,
      elapsedMs: elapsedMsOf(timer, now),
      durationMs: timer.durationMs,
      progress: progressOf(timer, now),
      isIdle: timer.status === 'idle',
      isRunning: timer.status === 'running',
      isPaused: timer.status === 'paused',
      isActive: isActiveOf(timer),
      isCompleted: timer.status === 'completed',
      isAbandoned: timer.status === 'abandoned',
      start,
      pause: pauseSession,
      resume: resumeSession,
      reset,
      abandon: abandonSession,
      setMode,
    };
  }, [timer, now, start, pauseSession, resumeSession, reset, abandonSession, setMode]);
}
