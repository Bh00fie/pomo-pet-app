/**
 * Local notification scheduled for the exact `endsAt` of a running session, so the user is told
 * their session finished even with the app backgrounded or the screen locked.
 *
 * Every call is wrapped: notification permission can be denied, and Expo Go on SDK 54 is a
 * restricted host for this module. A failure here must never take the timer down with it — the
 * timer is authoritative, the notification is a courtesy.
 */
import * as Notifications from 'expo-notifications';

import { NOTIFICATIONS } from '@/config';
import type { TimerMode } from './machine';

/** Foreground presentation. Without this the banner is swallowed while the app is open. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Ask once, only if not already granted. Resolves to whether we may post notifications. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain === false) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    warn('permission check failed', error);
    return false;
  }
}

/**
 * Schedule the "session over" notification for `endsAt`.
 * Returns the identifier needed to cancel it, or null if nothing was scheduled (permission
 * denied, `endsAt` already in the past, or the module threw).
 */
export async function scheduleSessionEndNotification(params: {
  mode: TimerMode;
  endsAt: number;
  now?: number;
}): Promise<string | null> {
  const { mode, endsAt, now = Date.now() } = params;
  if (!Number.isFinite(endsAt) || endsAt <= now) return null;

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  const copy = mode === 'focus' ? NOTIFICATIONS.focus : NOTIFICATIONS.break;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: true,
        categoryIdentifier: NOTIFICATIONS.sessionEndCategory,
        data: { kind: NOTIFICATIONS.sessionEndCategory, mode, endsAt },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: endsAt,
      },
    });
  } catch (error) {
    warn('schedule failed', error);
    return null;
  }
}

/** Cancel a previously scheduled session-end notification. Safe to call with null. */
export async function cancelSessionEndNotification(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (error) {
    warn('cancel failed', error);
  }
}

function warn(message: string, error: unknown): void {
  if (__DEV__) console.warn(`[notifications] ${message}`, error);
}
