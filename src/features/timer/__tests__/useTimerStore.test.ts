import { useAppStore } from '@/store';
import { createTimerState } from '../machine';
import { cancelSessionEndNotification, scheduleSessionEndNotification } from '../notifications';
import { durationMsForMode, useTimerStore } from '../useTimerStore';

jest.mock('../notifications', () => ({
  __esModule: true,
  configureNotificationHandler: jest.fn(),
  ensureNotificationPermission: jest.fn().mockResolvedValue(true),
  scheduleSessionEndNotification: jest.fn(),
  cancelSessionEndNotification: jest.fn(),
}));

const schedule = scheduleSessionEndNotification as jest.MockedFunction<
  typeof scheduleSessionEndNotification
>;
const cancel = cancelSessionEndNotification as jest.MockedFunction<
  typeof cancelSessionEndNotification
>;

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

/** Let the fire-and-forget notification sync settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  schedule.mockResolvedValue('scheduled-id');
  cancel.mockResolvedValue(undefined);
  jest.spyOn(Date, 'now').mockReturnValue(NOW);

  useAppStore.setState((s) => ({
    settings: { ...s.settings, workMinutes: 25, shortBreakMinutes: 5, notificationsEnabled: true },
  }));
  useTimerStore.setState({ timer: createTimerState('focus', 25 * MINUTE), notificationId: null });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('durationMsForMode', () => {
  it('reads the user-configured lengths', () => {
    useAppStore.setState((s) => ({ settings: { ...s.settings, workMinutes: 40, shortBreakMinutes: 10 } }));
    expect(durationMsForMode('focus')).toBe(40 * MINUTE);
    expect(durationMsForMode('break')).toBe(10 * MINUTE);
  });
});

describe('start', () => {
  it('runs for the configured focus length and schedules the end notification', async () => {
    useTimerStore.getState().start();
    await flush();

    const { timer, notificationId } = useTimerStore.getState();
    expect(timer.status).toBe('running');
    expect(timer.endsAt).toBe(NOW + 25 * MINUTE);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({ mode: 'focus', endsAt: NOW + 25 * MINUTE });
    expect(notificationId).toBe('scheduled-id');
  });

  it('honours an explicit mode and picks up that mode’s length', async () => {
    useTimerStore.getState().start({ mode: 'break' });
    await flush();

    const { timer } = useTimerStore.getState();
    expect(timer.mode).toBe('break');
    expect(timer.durationMs).toBe(5 * MINUTE);
    expect(schedule).toHaveBeenCalledWith({ mode: 'break', endsAt: NOW + 5 * MINUTE });
  });

  it('schedules nothing when the user turned notifications off', async () => {
    useAppStore.setState((s) => ({ settings: { ...s.settings, notificationsEnabled: false } }));
    useTimerStore.getState().start();
    await flush();

    expect(useTimerStore.getState().timer.status).toBe('running');
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe('pause / resume', () => {
  it('cancels the notification on pause and reschedules on resume', async () => {
    useTimerStore.getState().start();
    await flush();

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 10 * MINUTE);
    useTimerStore.getState().pause();
    await flush();

    expect(cancel).toHaveBeenCalledWith('scheduled-id');
    expect(useTimerStore.getState().notificationId).toBeNull();
    expect(useTimerStore.getState().timer.pausedRemainingMs).toBe(15 * MINUTE);
    expect(schedule).toHaveBeenCalledTimes(1); // still only the original

    schedule.mockResolvedValue('rescheduled-id');
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 30 * MINUTE);
    useTimerStore.getState().resume();
    await flush();

    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenLastCalledWith({ mode: 'focus', endsAt: NOW + 45 * MINUTE });
    expect(useTimerStore.getState().notificationId).toBe('rescheduled-id');
  });
});

describe('reset / abandon / tick', () => {
  it('reset returns to idle and cancels the pending notification', async () => {
    useTimerStore.getState().start();
    await flush();

    useTimerStore.getState().reset();
    await flush();

    expect(useTimerStore.getState().timer.status).toBe('idle');
    expect(cancel).toHaveBeenCalledWith('scheduled-id');
    expect(useTimerStore.getState().notificationId).toBeNull();
  });

  it('abandon cancels the notification', async () => {
    useTimerStore.getState().start();
    await flush();

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 2 * MINUTE);
    useTimerStore.getState().abandon();
    await flush();

    expect(useTimerStore.getState().timer.status).toBe('abandoned');
    expect(cancel).toHaveBeenCalledWith('scheduled-id');
  });

  it('tick completes the session at the boundary and cancels the (now redundant) notification', async () => {
    useTimerStore.getState().start();
    await flush();

    useTimerStore.getState().tick(NOW + 25 * MINUTE - 1);
    expect(useTimerStore.getState().timer.status).toBe('running');

    useTimerStore.getState().tick(NOW + 25 * MINUTE);
    await flush();
    expect(useTimerStore.getState().timer.status).toBe('completed');
    expect(cancel).toHaveBeenCalledWith('scheduled-id');
  });
});

describe('syncFromSettings', () => {
  it('adopts a changed length while idle', () => {
    useAppStore.setState((s) => ({ settings: { ...s.settings, workMinutes: 45 } }));
    useTimerStore.getState().syncFromSettings();
    expect(useTimerStore.getState().timer.durationMs).toBe(45 * MINUTE);
  });

  it('never re-lengths a session that is already in flight', async () => {
    useTimerStore.getState().start();
    await flush();

    useAppStore.setState((s) => ({ settings: { ...s.settings, workMinutes: 45 } }));
    useTimerStore.getState().syncFromSettings();

    const { timer } = useTimerStore.getState();
    expect(timer.status).toBe('running');
    expect(timer.durationMs).toBe(25 * MINUTE);
    expect(timer.endsAt).toBe(NOW + 25 * MINUTE);
  });

  it('leaves a completed session alone so its result stays on screen', async () => {
    useTimerStore.getState().start();
    await flush();
    useTimerStore.getState().tick(NOW + 25 * MINUTE);
    await flush();

    useAppStore.setState((s) => ({ settings: { ...s.settings, workMinutes: 45 } }));
    useTimerStore.getState().syncFromSettings();
    expect(useTimerStore.getState().timer.status).toBe('completed');
  });
});
