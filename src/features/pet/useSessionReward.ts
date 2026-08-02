import { useEffect, useRef } from 'react';

import { useTimer } from '@/features/timer';
import { useAppStore } from '@/store';

/**
 * Hooks into the timer engine's `completed` transition (docs/PLAN.md M2) and applies the
 * session reward exactly once per completed focus session. Mount this once near the app root
 * (`app/_layout.tsx`) rather than only inside the Focus screen, so a session that finishes while
 * the user is on another tab still awards — `useTimer()` is a cheap subscription to the shared
 * timer store, safe to mount more than once.
 *
 * Break sessions award nothing — only `mode === 'focus'`.
 *
 * Idempotency: the timer machine keeps `endsAt` set after completion (it is *when* the session
 * finished), so it is a stable per-session key. We only award once per distinct `endsAt`.
 */
export function useSessionReward(): void {
  const timer = useTimer();
  const awardSessionCompletion = useAppStore((s) => s.awardSessionCompletion);
  const rewardedEndsAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (timer.mode !== 'focus' || !timer.isCompleted) return;
    const endsAt = timer.state.endsAt;
    if (endsAt === null || rewardedEndsAtRef.current === endsAt) return;

    rewardedEndsAtRef.current = endsAt;
    // `elapsedMs`, not `durationMs`: the two agree once a session is genuinely `completed`, but
    // this is the one that stays correct if that ever changes.
    awardSessionCompletion(timer.elapsedMs, Date.now());
  }, [timer.mode, timer.isCompleted, timer.state.endsAt, timer.elapsedMs, awardSessionCompletion]);
}
