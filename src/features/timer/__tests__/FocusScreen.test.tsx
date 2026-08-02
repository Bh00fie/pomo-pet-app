/**
 * End-to-end check of the actual screen the user taps, not just the engine underneath it.
 * The M0 build shipped a Start button that did nothing — these tests are the regression net for
 * that: pressing Start must genuinely put the timer into `running` and make the clock move.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AppState } from 'react-native';

import { ACCOUNTABILITY } from '@/config';
import { useLeaveEarlyPenalty } from '@/features/pet';
import { useAppStore } from '@/store';
import { FocusScreen } from '../FocusScreen';
import { createTimerState } from '../machine';
import { useTimerStore } from '../useTimerStore';

jest.mock('../notifications', () => ({
  __esModule: true,
  configureNotificationHandler: jest.fn(),
  ensureNotificationPermission: jest.fn().mockResolvedValue(true),
  scheduleSessionEndNotification: jest.fn().mockResolvedValue('scheduled-id'),
  cancelSessionEndNotification: jest.fn().mockResolvedValue(undefined),
}));

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

/** Advance both the fake interval and the wall clock the timer reads. */
const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/** Simulates the OS delivering an `AppState` `'change'` event, using the listener the mounted
 *  screen actually registered — the real RN jest mock's `addEventListener` never fires on its
 *  own (see `node_modules/react-native/jest/mocks/AppState.js`), so tests have to invoke the
 *  captured callback directly to exercise the M4 background/foreground handling. */
const fireAppStateChange = async (next: 'active' | 'background' | 'inactive') => {
  const addEventListener = AppState.addEventListener as jest.Mock;
  const handler = addEventListener.mock.calls.find(([event]) => event === 'change')?.[1];
  await act(async () => {
    handler?.(next);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  (AppState.addEventListener as jest.Mock).mockClear();

  useAppStore.setState((s) => ({
    hydrated: true,
    settings: { ...s.settings, workMinutes: 25, shortBreakMinutes: 5, notificationsEnabled: true },
  }));
  useTimerStore.setState({
    timer: createTimerState('focus', 25 * MINUTE),
    notificationId: null,
    backgroundedAt: null,
    lastPenaltyToken: 0,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('FocusScreen', () => {
  it('shows the configured focus length while idle', async () => {
    await render(<FocusScreen />);

    expect(screen.getByText('25:00')).toBeTruthy();
    expect(screen.getByText('FOCUS')).toBeTruthy();
    expect(screen.getByText('Start focus session')).toBeTruthy();
  });

  it('starts a real running session when Start is pressed, and the clock counts down', async () => {
    await render(<FocusScreen />);

    await fireEvent.press(screen.getByText('Start focus session'));

    expect(useTimerStore.getState().timer.status).toBe('running');
    expect(useTimerStore.getState().timer.endsAt).toBe(NOW + 25 * MINUTE);
    expect(screen.getByText('Pause')).toBeTruthy();
    expect(screen.queryByText('Start focus session')).toBeNull();

    await advance(MINUTE);
    expect(screen.getByText('24:00')).toBeTruthy();

    await advance(30_000);
    expect(screen.getByText('23:30')).toBeTruthy();
  });

  it('pauses on Pause, holds the clock, and resumes from the exact same remainder', async () => {
    await render(<FocusScreen />);
    await fireEvent.press(screen.getByText('Start focus session'));

    await advance(5 * MINUTE);
    expect(screen.getByText('20:00')).toBeTruthy();

    await fireEvent.press(screen.getByText('Pause'));
    expect(useTimerStore.getState().timer.status).toBe('paused');
    expect(screen.getByText('PAUSED')).toBeTruthy();

    // Time passing while paused must not move the clock.
    await advance(10 * MINUTE);
    expect(screen.getByText('20:00')).toBeTruthy();

    await fireEvent.press(screen.getByText('Resume'));
    expect(useTimerStore.getState().timer.status).toBe('running');
    expect(screen.getByText('20:00')).toBeTruthy();

    await advance(MINUTE);
    expect(screen.getByText('19:00')).toBeTruthy();
  });

  it('completes exactly at the boundary', async () => {
    await render(<FocusScreen />);
    await fireEvent.press(screen.getByText('Start focus session'));

    await advance(25 * MINUTE - 1_000);
    expect(screen.getByText('00:01')).toBeTruthy();
    expect(useTimerStore.getState().timer.status).toBe('running');

    await advance(1_000);
    expect(useTimerStore.getState().timer.status).toBe('completed');
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getByText('FOCUS COMPLETE')).toBeTruthy();
    expect(screen.getByText('Start break')).toBeTruthy();
  });

  it('abandons the session from Give up', async () => {
    await render(<FocusScreen />);
    await fireEvent.press(screen.getByText('Start focus session'));

    await advance(2 * MINUTE);
    await fireEvent.press(screen.getByText('Give up'));

    expect(useTimerStore.getState().timer.status).toBe('abandoned');
    expect(screen.getByText('SESSION ABANDONED')).toBeTruthy();
  });

  it('resets back to a fresh idle timer', async () => {
    await render(<FocusScreen />);
    await fireEvent.press(screen.getByText('Start focus session'));
    await advance(3 * MINUTE);

    await fireEvent.press(screen.getByText('Pause'));
    await fireEvent.press(screen.getByText('Reset'));

    expect(useTimerStore.getState().timer.status).toBe('idle');
    expect(screen.getByText('25:00')).toBeTruthy();
    expect(screen.getByText('Start focus session')).toBeTruthy();
  });

  it('switches to break mode and starts a break of the configured length', async () => {
    await render(<FocusScreen />);

    await fireEvent.press(screen.getByLabelText('Break mode'));
    expect(screen.getByText('05:00')).toBeTruthy();

    await fireEvent.press(screen.getByText('Start break'));
    const { timer } = useTimerStore.getState();
    expect(timer.mode).toBe('break');
    expect(timer.durationMs).toBe(5 * MINUTE);
    expect(timer.endsAt).toBe(NOW + 5 * MINUTE);
  });

  it('adjusts session lengths from the +/- controls and the clock follows', async () => {
    await render(<FocusScreen />);

    await fireEvent.press(screen.getByLabelText('Increase focus length'));
    expect(useAppStore.getState().settings.workMinutes).toBe(30);
    expect(screen.getByText('30:00')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Decrease focus length'));
    await fireEvent.press(screen.getByLabelText('Decrease focus length'));
    expect(useAppStore.getState().settings.workMinutes).toBe(20);
    expect(screen.getByText('20:00')).toBeTruthy();
  });

  describe('hatch preview (post-XP reward rearchitecture — see CLAUDE.md)', () => {
    it('shows a Fry of the active species below the threshold', async () => {
      await render(<FocusScreen />);
      expect(screen.getByText('A Fry — Coral Tetra')).toBeTruthy();
    });

    it('updates live to a Juvenile once the stepper reaches the threshold, with no named species', async () => {
      await render(<FocusScreen />);

      // 25 -> 50 in steps of 5: five presses of the focus-length stepper.
      for (let i = 0; i < 5; i += 1) {
        await fireEvent.press(screen.getByLabelText('Increase focus length'));
      }
      expect(useAppStore.getState().settings.workMinutes).toBe(50);

      expect(screen.queryByText('A Fry — Coral Tetra')).toBeNull();
      expect(screen.getByText('A Juvenile — a random species from your collection')).toBeTruthy();
    });

    it('goes back to naming the Fry species when stepped back below the threshold', async () => {
      await render(<FocusScreen />);

      for (let i = 0; i < 5; i += 1) {
        await fireEvent.press(screen.getByLabelText('Increase focus length'));
      }
      await fireEvent.press(screen.getByLabelText('Decrease focus length'));
      expect(useAppStore.getState().settings.workMinutes).toBe(45);

      expect(screen.getByText('A Fry — Coral Tetra')).toBeTruthy();
    });
  });

  it('keeps the countdown correct across a background gap with no ticks', async () => {
    await render(<FocusScreen />);
    await fireEvent.press(screen.getByText('Start focus session'));

    // Simulate backgrounding: the wall clock moves but no interval callbacks run.
    await act(async () => {
      jest.setSystemTime(NOW + 15 * MINUTE);
    });
    // First tick after returning re-derives everything from `endsAt`.
    await advance(250);

    expect(screen.getByText('10:00')).toBeTruthy();
    expect(useTimerStore.getState().timer.status).toBe('running');
  });

  describe('leave-early penalty (docs/PLAN.md M4) — real AppState events, mocked Date.now()', () => {
    it('does not penalize a brief `background` excursion under the grace period', async () => {
      await render(<FocusScreen />);
      await fireEvent.press(screen.getByText('Start focus session'));

      await fireAppStateChange('background');
      await act(async () => {
        jest.setSystemTime(NOW + ACCOUNTABILITY.backgroundGraceMs - 500);
      });
      await fireAppStateChange('active');

      expect(useTimerStore.getState().timer.status).toBe('running');
      expect(screen.queryByText('SESSION ABANDONED')).toBeNull();
    });

    it('never penalizes on `inactive` alone, no matter how long it lasts', async () => {
      await render(<FocusScreen />);
      await fireEvent.press(screen.getByText('Start focus session'));

      await fireAppStateChange('inactive');
      await act(async () => {
        jest.setSystemTime(NOW + 5 * MINUTE); // well past the grace period
      });
      await fireAppStateChange('active');

      expect(useTimerStore.getState().timer.status).toBe('running');
    });

    it('abandons the session and marks a fish sick after sustained backgrounding past the grace period', async () => {
      // `useLeaveEarlyPenalty` is normally mounted once at the app root (`app/_layout.tsx`),
      // same as `useSessionReward` — mount it alongside the screen here so this test can observe
      // the actual fish-sickening consequence, not just the timer's `abandoned` transition.
      function Harness() {
        useLeaveEarlyPenalty();
        return <FocusScreen />;
      }

      useAppStore.getState().resetAll();
      useAppStore.getState().awardSessionCompletion(MINUTE, NOW - MINUTE); // seed one healthy fish
      const fishId = useAppStore.getState().fish[0].id;

      await render(<Harness />);
      await fireEvent.press(screen.getByText('Start focus session'));

      await fireAppStateChange('background');
      await act(async () => {
        jest.setSystemTime(NOW + ACCOUNTABILITY.backgroundGraceMs + 1_000);
      });
      await fireAppStateChange('active');

      expect(useTimerStore.getState().timer.status).toBe('abandoned');
      expect(screen.getByText('SESSION ABANDONED')).toBeTruthy();
      expect(useAppStore.getState().fish.find((f) => f.id === fishId)?.health).toBe('sick');
      expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
    });

    it('penalizes a full-session background even though the timer would also have finished (user decision, post-M4 review)', async () => {
      await render(<FocusScreen />);
      await fireEvent.press(screen.getByText('Start focus session'));

      await fireAppStateChange('background');
      await act(async () => {
        jest.setSystemTime(NOW + 26 * MINUTE); // past the full 25-minute session length
      });
      await fireAppStateChange('active');

      expect(useTimerStore.getState().timer.status).toBe('abandoned');
      expect(screen.getByText('SESSION ABANDONED')).toBeTruthy();
    });

    it('still penalizes when the tick interval fires before the `active` event on resume', async () => {
      // The ordering hazard behind `tick`'s `backgroundedAt` guard. `useTimer`'s interval is a
      // second, independent path to `completed` (`if (current >= endsAt) tick(current)`), and on
      // iOS an overdue timer callback can be delivered *before* the `AppState` `'active'`
      // listener runs. Without the guard the session would already be `completed` by the time
      // `resolveForeground` looked at it, and the excursion would escape the penalty — the exact
      // hole this rule closes, reopened by a race rather than by the check order.
      await render(<FocusScreen />);
      await fireEvent.press(screen.getByText('Start focus session'));

      await fireAppStateChange('background');

      // Land the wall clock past `endsAt`, then let one interval callback through *before* the
      // foreground event, which is what a resumed overdue timer looks like.
      await act(async () => {
        jest.setSystemTime(NOW + 26 * MINUTE - 250);
      });
      await advance(250);
      expect(useTimerStore.getState().timer.status).toBe('running'); // suppressed, not completed

      await fireAppStateChange('active');

      expect(useTimerStore.getState().timer.status).toBe('abandoned');
      expect(screen.getByText('SESSION ABANDONED')).toBeTruthy();
    });

    it('completes normally when a brief within-grace excursion happens to span `endsAt`', async () => {
      // The other side of the same guard: a short lock-screen glance that the timer happens to
      // finish during is still a completion, not a penalty. The fix must not overcorrect.
      await render(<FocusScreen />);
      await fireEvent.press(screen.getByText('Start focus session'));

      await act(async () => {
        jest.setSystemTime(NOW + 25 * MINUTE - 2_000); // 2s left
      });
      await fireAppStateChange('background');
      await act(async () => {
        jest.setSystemTime(NOW + 25 * MINUTE + 4_000); // away 6s total — inside the 8s grace
      });
      await fireAppStateChange('active');

      expect(useTimerStore.getState().timer.status).toBe('completed');
      expect(useTimerStore.getState().lastPenaltyToken).toBe(0);
      expect(screen.queryByText('SESSION ABANDONED')).toBeNull();
    });
  });
});
