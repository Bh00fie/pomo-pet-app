import * as Notifications from 'expo-notifications';

import { NOTIFICATIONS } from '@/config';
import {
  cancelSessionEndNotification,
  configureNotificationHandler,
  ensureNotificationPermission,
  scheduleSessionEndNotification,
} from '../notifications';

jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const mocked = Notifications as unknown as {
  setNotificationHandler: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
};

const NOW = 1_700_000_000_000;
const ENDS_AT = NOW + 25 * 60_000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mocked.scheduleNotificationAsync.mockResolvedValue('notification-id');
  mocked.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('scheduleSessionEndNotification', () => {
  it('schedules a one-shot date trigger at exactly endsAt', async () => {
    const id = await scheduleSessionEndNotification({ mode: 'focus', endsAt: ENDS_AT, now: NOW });

    expect(id).toBe('notification-id');
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: NOTIFICATIONS.focus.title,
        body: NOTIFICATIONS.focus.body,
        sound: true,
        categoryIdentifier: NOTIFICATIONS.sessionEndCategory,
        data: { kind: NOTIFICATIONS.sessionEndCategory, mode: 'focus', endsAt: ENDS_AT },
      },
      trigger: { type: 'date', date: ENDS_AT },
    });
  });

  it('uses the break copy in break mode', async () => {
    await scheduleSessionEndNotification({ mode: 'break', endsAt: ENDS_AT, now: NOW });

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: NOTIFICATIONS.break.title,
          body: NOTIFICATIONS.break.body,
        }),
      }),
    );
  });

  it('does not schedule anything already in the past', async () => {
    expect(await scheduleSessionEndNotification({ mode: 'focus', endsAt: NOW - 1, now: NOW })).toBeNull();
    expect(await scheduleSessionEndNotification({ mode: 'focus', endsAt: NOW, now: NOW })).toBeNull();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when it has not been granted yet', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: true });

    const id = await scheduleSessionEndNotification({ mode: 'focus', endsAt: ENDS_AT, now: NOW });

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(id).toBe('notification-id');
  });

  it('schedules nothing when permission is denied', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: false });

    expect(await scheduleSessionEndNotification({ mode: 'focus', endsAt: ENDS_AT, now: NOW })).toBeNull();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not re-prompt once the user has permanently declined', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    expect(await scheduleSessionEndNotification({ mode: 'focus', endsAt: ENDS_AT, now: NOW })).toBeNull();
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('swallows a module failure — the timer is authoritative, the notification is a courtesy', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValue(new Error('Expo Go says no'));
    await expect(
      scheduleSessionEndNotification({ mode: 'focus', endsAt: ENDS_AT, now: NOW }),
    ).resolves.toBeNull();
  });
});

describe('cancelSessionEndNotification', () => {
  it('cancels by identifier', async () => {
    await cancelSessionEndNotification('notification-id');
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-id');
  });

  it('is a no-op for null/undefined/empty ids', async () => {
    await cancelSessionEndNotification(null);
    await cancelSessionEndNotification(undefined);
    await cancelSessionEndNotification('');
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('swallows a cancellation failure', async () => {
    mocked.cancelScheduledNotificationAsync.mockRejectedValue(new Error('gone'));
    await expect(cancelSessionEndNotification('notification-id')).resolves.toBeUndefined();
  });
});

describe('ensureNotificationPermission', () => {
  it('short-circuits when already granted', async () => {
    expect(await ensureNotificationPermission()).toBe(true);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns false when the permission check itself throws', async () => {
    mocked.getPermissionsAsync.mockRejectedValue(new Error('no module'));
    expect(await ensureNotificationPermission()).toBe(false);
  });
});

describe('configureNotificationHandler', () => {
  it('presents the banner while the app is in the foreground', async () => {
    configureNotificationHandler();
    expect(mocked.setNotificationHandler).toHaveBeenCalledTimes(1);

    const handler = mocked.setNotificationHandler.mock.calls[0][0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});
