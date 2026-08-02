/**
 * End-to-end check of the actual screen the user taps, not just the engine underneath it.
 * The M0 build shipped a Start button that did nothing — these tests are the regression net for
 * that: pressing Start must genuinely put the timer into `running` and make the clock move.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

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

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);

  useAppStore.setState((s) => ({
    hydrated: true,
    settings: { ...s.settings, workMinutes: 25, shortBreakMinutes: 5, notificationsEnabled: true },
  }));
  useTimerStore.setState({ timer: createTimerState('focus', 25 * MINUTE), notificationId: null });
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
});
