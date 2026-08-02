import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { ReduceMotionPreference } from '@/store';
import { useAppStore } from '@/store';
import { REDUCED_MOTION_SCALE } from '../motion';
import { useReduceMotion } from '../useReduceMotion';

/**
 * The M5 tri-state override (`settings.reduceMotion`) layered over the OS accessibility setting.
 * Every animation consumer (`Ripple`, `ParticleBurst`, `useAquariumClock`, `MergeSequence`,
 * `Tank`'s penalty wince) reads *only* this hook's number, so this is the single place the whole
 * feature can be verified — all six preference × OS-state combinations.
 *
 * Deliberately written as transitions on one mounted hook rather than six independent renders:
 * three of the six combinations expect `1`, which is also the hook's pre-OS-read initial value, so
 * an isolated assertion would pass even if the OS value never arrived. Observing the value *change*
 * away from `REDUCED_MOTION_SCALE` proves the OS read actually landed first.
 */
function mockOsReduceMotion(enabled: boolean) {
  const listeners: ((next: boolean) => void)[] = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(enabled);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(((_event: string, handler: (next: boolean) => void) => {
      listeners.push(handler);
      return { remove: jest.fn() };
    }) as never);
  return {
    /** Simulate the user toggling Reduce Motion in iOS Settings while the app is open. */
    emit: async (next: boolean) => {
      await act(async () => {
        listeners.forEach((l) => l(next));
      });
    },
  };
}

async function setPreference(reduceMotion: ReduceMotionPreference) {
  await act(async () => {
    useAppStore.getState().setSettings({ reduceMotion });
  });
}

beforeEach(() => {
  useAppStore.getState().resetAll();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useReduceMotion — returns a multiplier, never a boolean', () => {
  it('is a number, and the reduced value is truthy (which is why callers must not branch on it)', async () => {
    mockOsReduceMotion(true);
    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(REDUCED_MOTION_SCALE));
    expect(typeof result.current).toBe('number');
    // The M2 rule this pins: `if (useReduceMotion())` is true in *both* states, so a boolean
    // check silently inverts. Consumers compare against 1 (see Tank.tsx) or multiply.
    expect(REDUCED_MOTION_SCALE).toBeGreaterThan(0);
    expect(REDUCED_MOTION_SCALE).toBeLessThan(1);
  });

  it('defaults to "system" for a fresh store', () => {
    expect(useAppStore.getState().settings.reduceMotion).toBe('system');
  });
});

describe('useReduceMotion — OS Reduce Motion ON', () => {
  it('system defers to the OS (reduced), on stays reduced, off forces full motion', async () => {
    const os = mockOsReduceMotion(true);
    const { result } = await renderHook(() => useReduceMotion());

    // 'system' — passthrough. Also proves the async OS read landed, which is what makes the
    // 'off' assertion below meaningful rather than a coincidence of the initial value.
    await waitFor(() => expect(result.current).toBe(REDUCED_MOTION_SCALE));
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();

    // 'on' — agrees with the OS, still reduced.
    await setPreference('on');
    expect(result.current).toBe(REDUCED_MOTION_SCALE);

    // 'off' — the override that only exists as of M5: full motion *despite* the OS setting.
    // This is a change away from the value observed above, not the untouched initial value.
    await setPreference('off');
    expect(result.current).toBe(1);

    // ...and it keeps overriding when the OS setting is toggled again at runtime.
    await os.emit(true);
    expect(result.current).toBe(1);

    // Back to 'system' and the OS value is honoured again — the override is not sticky.
    await setPreference('system');
    expect(result.current).toBe(REDUCED_MOTION_SCALE);
  });
});

describe('useReduceMotion — OS Reduce Motion OFF', () => {
  it('system defers to the OS (full), on forces reduced, off stays full', async () => {
    mockOsReduceMotion(false);
    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

    // 'on' first: it is the only combination in this group that differs from the initial value,
    // so establishing it up front gives the two `1` assertions below something to change *from*.
    await setPreference('on');
    expect(result.current).toBe(REDUCED_MOTION_SCALE);

    // 'system' — passthrough to an OS setting that is off.
    await setPreference('system');
    expect(result.current).toBe(1);

    await setPreference('on');
    expect(result.current).toBe(REDUCED_MOTION_SCALE);

    // 'off' — agrees with the OS, full motion.
    await setPreference('off');
    expect(result.current).toBe(1);
  });
});

describe('useReduceMotion — live OS changes', () => {
  it('"system" tracks a runtime reduceMotionChanged event in both directions', async () => {
    const os = mockOsReduceMotion(false);
    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(1));

    await os.emit(true);
    expect(result.current).toBe(REDUCED_MOTION_SCALE);

    await os.emit(false);
    expect(result.current).toBe(1);
  });

  it('"on" ignores the OS turning Reduce Motion off', async () => {
    const os = mockOsReduceMotion(true);
    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(REDUCED_MOTION_SCALE));
    await setPreference('on');

    await os.emit(false);
    expect(result.current).toBe(REDUCED_MOTION_SCALE);
  });

  it('unsubscribes the OS listener on unmount', async () => {
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove } as never);

    const { unmount } = await renderHook(() => useReduceMotion());
    await unmount();

    expect(remove).toHaveBeenCalled();
  });
});

describe('useReduceMotion — malformed persisted preference', () => {
  it('falls back to the OS value rather than crashing or forcing full motion', async () => {
    // Should be unreachable via the v2→v3 migration, but the hook is the last line of defence for
    // a hand-edited or partially-written payload: anything that is not 'on'/'off' must behave as
    // 'system', never silently disable the accessibility setting.
    await act(async () => {
      useAppStore.setState((s) => ({
        settings: { ...s.settings, reduceMotion: 'nonsense' as ReduceMotionPreference },
      }));
    });
    mockOsReduceMotion(true);
    const { result } = await renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(REDUCED_MOTION_SCALE));
  });
});
