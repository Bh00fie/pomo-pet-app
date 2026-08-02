import { useEffect, useRef } from 'react';

import { useTimerStore } from '@/features/timer';
import { useAppStore } from '@/store';

/**
 * Reacts to the M4 leave-early penalty (docs/PLAN.md M4). `useTimerStore.resolveForeground`
 * bumps `lastPenaltyToken` exactly when a running session is auto-abandoned for staying
 * backgrounded past `ACCOUNTABILITY.backgroundGraceMs` — never for a manual "Give up" (which
 * already withholds the reward on its own via `useSessionReward` only firing on `completed`),
 * and never when the excursion stayed *within* the grace period (whether or not `endsAt` also
 * passed during that short window). Sustained backgrounding always penalizes now, even if
 * `endsAt` also passed while away — see `resolveForeground`'s doc comment.
 *
 * Mount this once near the app root, same reasoning as `useSessionReward`: a session that gets
 * penalized while the user is on another tab still needs a fish to get sick.
 *
 * Dedupes on the token (not on `timer.status === 'abandoned'`, which a manual give-up also
 * produces) via a hook-local ref, exactly like `useSessionReward`'s `endsAt` dedup — that guard
 * is per hook instance, so do not mount this a second time or a penalty could double-apply.
 */
export function useLeaveEarlyPenalty(): void {
  const penaltyToken = useTimerStore((s) => s.lastPenaltyToken);
  const penalizeAbandonedSession = useAppStore((s) => s.penalizeAbandonedSession);
  const handledTokenRef = useRef(0);

  useEffect(() => {
    if (penaltyToken === handledTokenRef.current) return;
    handledTokenRef.current = penaltyToken;
    penalizeAbandonedSession(Date.now());
  }, [penaltyToken, penalizeAbandonedSession]);
}
