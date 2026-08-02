import { ACCOUNTABILITY } from '@/config';
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
  useTimerStore.setState({
    timer: createTimerState('focus', 25 * MINUTE),
    notificationId: null,
    backgroundedAt: null,
    lastPenaltyToken: 0,
  });
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

  it('a manual abandon counts as an abandoned session but never sickens a fish (M5-review fix)', async () => {
    // Two decisions that must hold at once: the counter literally named "abandoned sessions"
    // has to count a manual Give up (it did not, before this fix), and the separate, deliberate
    // call that give-up stays exempt from the fish-health penalty must be unaffected — sickening
    // a fish is still exclusively the auto-abandon path's (`penalizeAbandonedSession`) job.
    useAppStore.getState().resetAll();
    useAppStore.getState().awardSessionCompletion(MINUTE, NOW - MINUTE); // seed one healthy fish
    const fishId = useAppStore.getState().fish[0].id;
    expect(useAppStore.getState().stats.abandonedSessions).toBe(0);

    useTimerStore.getState().start();
    await flush();

    jest.spyOn(Date, 'now').mockReturnValue(NOW + 2 * MINUTE);
    useTimerStore.getState().abandon();
    await flush();

    expect(useTimerStore.getState().timer.status).toBe('abandoned');
    expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
    expect(useAppStore.getState().fish.find((f) => f.id === fishId)?.health).toBe('healthy');
  });

  it('does not count an abandon call when there was no active session to abandon', () => {
    // `machine.ts`'s ABANDON transition is already a no-op outside running/paused; the store's
    // `wasActive` check must agree, so a stray call can never double-count.
    useAppStore.getState().resetAll();
    useTimerStore.getState().abandon(); // idle — the real UI never offers "Give up" here

    expect(useAppStore.getState().stats.abandonedSessions).toBe(0);
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

describe('noteBackgrounded / resolveForeground (docs/PLAN.md M4 leave-early penalty)', () => {
  it('records an absolute backgroundedAt timestamp only while a session is running', () => {
    useTimerStore.getState().noteBackgrounded(NOW); // idle — no-op
    expect(useTimerStore.getState().backgroundedAt).toBeNull();

    useTimerStore.getState().start();
    useTimerStore.getState().noteBackgrounded(NOW + 5_000);
    expect(useTimerStore.getState().backgroundedAt).toBe(NOW + 5_000);
  });

  it('does not overwrite an already-open backgrounded excursion (e.g. a brief `inactive` blip in between)', () => {
    useTimerStore.getState().start();
    useTimerStore.getState().noteBackgrounded(NOW + 1_000);
    useTimerStore.getState().noteBackgrounded(NOW + 4_000); // second call while still open
    expect(useTimerStore.getState().backgroundedAt).toBe(NOW + 1_000);
  });

  it('does not track backgrounding during a break — stepping away is the point of a break', async () => {
    useTimerStore.getState().start({ mode: 'break' });
    await flush();

    useTimerStore.getState().noteBackgrounded(NOW + 1_000);
    expect(useTimerStore.getState().backgroundedAt).toBeNull();

    useTimerStore.getState().resolveForeground(NOW + 1_000 + ACCOUNTABILITY.backgroundGraceMs + 1);
    expect(useTimerStore.getState().timer.status).toBe('running');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(0);
  });

  it('does not track backgrounding while paused', async () => {
    useTimerStore.getState().start();
    await flush();
    useTimerStore.getState().pause();
    await flush();

    useTimerStore.getState().noteBackgrounded(NOW + 1_000);
    expect(useTimerStore.getState().backgroundedAt).toBeNull();
  });

  it('does nothing on foreground when there was no open background excursion', () => {
    useTimerStore.getState().start();
    useTimerStore.getState().resolveForeground(NOW + 1_000);

    expect(useTimerStore.getState().timer.status).toBe('running');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(0);
  });

  it('does not penalize a brief excursion under the grace period', () => {
    useTimerStore.getState().start();
    useTimerStore.getState().noteBackgrounded(NOW + 1_000);
    useTimerStore.getState().resolveForeground(NOW + 1_000 + ACCOUNTABILITY.backgroundGraceMs - 1);

    expect(useTimerStore.getState().timer.status).toBe('running');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(0);
    expect(useTimerStore.getState().backgroundedAt).toBeNull(); // cleared regardless
  });

  it('treats an excursion of exactly backgroundGraceMs as still inside the grace period', () => {
    // Pinning the boundary: the comparison is `elapsed <= grace`, so the grace period is
    // inclusive. Landing exactly on it is forgiven; one millisecond past it is not (below).
    useTimerStore.getState().start();
    useTimerStore.getState().noteBackgrounded(NOW + 1_000);
    useTimerStore.getState().resolveForeground(NOW + 1_000 + ACCOUNTABILITY.backgroundGraceMs);

    expect(useTimerStore.getState().timer.status).toBe('running');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(0);
  });

  it('auto-abandons and bumps lastPenaltyToken once the grace period is exceeded', async () => {
    useTimerStore.getState().start();
    await flush();

    useTimerStore.getState().noteBackgrounded(NOW + 1_000);
    useTimerStore.getState().resolveForeground(NOW + 1_000 + ACCOUNTABILITY.backgroundGraceMs + 1);

    expect(useTimerStore.getState().timer.status).toBe('abandoned');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(1);
  });

  it('penalizes sustained backgrounding even when the session\'s own endsAt also passed while away', () => {
    // The user's decision (post-M4 review): leaving the app past the grace period is what's
    // punished, full stop — "the timer would also have finished" is not an escape hatch.
    useTimerStore.getState().start(); // 25-minute focus session

    // Backgrounded for the entire session and well beyond the grace period. Even though the
    // session's own endsAt was reached while away, sustained backgrounding still abandons it.
    useTimerStore.getState().noteBackgrounded(NOW + MINUTE);
    useTimerStore.getState().resolveForeground(NOW + 26 * MINUTE);

    expect(useTimerStore.getState().timer.status).toBe('abandoned');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(1);
  });

  it('penalizes a session backgrounded for its full duration or longer (elapsed >= durationMs)', () => {
    // The exact scenario the review flagged: backgrounding for the entire 25-minute session
    // used to `complete` in full; it must now abandon+penalize, same as any other excursion past
    // the grace period.
    useTimerStore.getState().start(); // 25-minute focus session, endsAt = NOW + 25 * MINUTE

    useTimerStore.getState().noteBackgrounded(NOW);
    useTimerStore.getState().resolveForeground(NOW + 25 * MINUTE); // exactly the full duration

    expect(useTimerStore.getState().timer.status).toBe('abandoned');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(1);
  });

  it('suppresses `tick` while a background excursion is open, so it cannot complete the session first', () => {
    // `resolveForeground` owns the resolution of a backgrounded session. If the interval's tick
    // could complete it first (iOS can deliver an overdue timer callback before the AppState
    // `'active'` listener on resume), the excursion would find nothing `running` to penalize.
    useTimerStore.getState().start();
    useTimerStore.getState().noteBackgrounded(NOW + MINUTE);

    useTimerStore.getState().tick(NOW + 26 * MINUTE); // well past endsAt, but still backgrounded
    expect(useTimerStore.getState().timer.status).toBe('running');

    useTimerStore.getState().resolveForeground(NOW + 26 * MINUTE);
    expect(useTimerStore.getState().timer.status).toBe('abandoned');
    expect(useTimerStore.getState().lastPenaltyToken).toBe(1);
  });

  it('leaves `tick` alone when there is no open excursion, including during a break', () => {
    // The guard keys off `backgroundedAt`, which `noteBackgrounded` refuses to set for a break —
    // so break sessions (and ordinary foregrounded focus sessions) still complete on the tick.
    useTimerStore.getState().start({ mode: 'break' });
    useTimerStore.getState().noteBackgrounded(NOW); // no-op: breaks are exempt
    expect(useTimerStore.getState().backgroundedAt).toBeNull();

    useTimerStore.getState().tick(NOW + 5 * MINUTE);
    expect(useTimerStore.getState().timer.status).toBe('completed');
  });

  it('does not double-penalize across repeated foreground events for the same excursion', () => {
    useTimerStore.getState().start();
    useTimerStore.getState().noteBackgrounded(NOW + 1_000);
    useTimerStore.getState().resolveForeground(NOW + 1_000 + ACCOUNTABILITY.backgroundGraceMs + 1);
    expect(useTimerStore.getState().lastPenaltyToken).toBe(1);

    // A second `active` event with no new backgroundedAt in between must not re-penalize —
    // the session is already `abandoned`, not `running`.
    useTimerStore.getState().resolveForeground(NOW + 1_000 + ACCOUNTABILITY.backgroundGraceMs + 5_000);
    expect(useTimerStore.getState().lastPenaltyToken).toBe(1);
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
