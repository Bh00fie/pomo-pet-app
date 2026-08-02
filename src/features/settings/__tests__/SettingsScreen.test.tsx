/**
 * The Settings screen's **debug panel** (added post-M6a review), plus the one thing about this
 * screen that is not covered anywhere else: that it can actually be reached.
 *
 * The store-level tests in `src/store/__tests__/useAppStore.test.ts` already pin what
 * `debugGrantXp`/`debugCapAllFish`/`debugSpawnFish` *do*. What they cannot see is the wiring: a
 * button labelled "+360 XP" that calls `debugGrantXp(120, …)`, or a "Spawn a Golden Koi fry"
 * button that hands over a Coral Tetra because the label read `settings.activeSpeciesId` while
 * the action re-validated it against entitlements. Both are invisible to a pure-logic test and
 * both are exactly the kind of thing the user would then mis-diagnose as a store bug on device.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { GROWTH } from '@/config';
import { GOLDEN_KOI_SPECIES_ID, STARTER_SPECIES_ID } from '@/features/pet/model';
import { useAppStore } from '@/store';
import { SettingsScreen } from '../SettingsScreen';

const fish = () => useAppStore.getState().fish;

beforeEach(() => {
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true });
});

describe('SettingsScreen — debug panel wiring (post-M6a review)', () => {
  it('labels itself as testing-only so it can never be mistaken for a shipped feature', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText(/DEBUG — TESTING ONLY/)).toBeTruthy();
  });

  it('grants the XP amount each button says it grants', async () => {
    // A transposed handler (+360 calling debugGrantXp(120)) type-checks, passes every store test,
    // and is only visible from here.
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('+120 XP'));
    expect(fish()[0].xp).toBe(Math.min(120, GROWTH.xpPerStage));

    await act(async () => useAppStore.getState().resetAll());
    await fireEvent.press(screen.getByText('+360 XP'));
    // 360 spread through the real overflow chain from an empty tank: the spawn branch is the base
    // case and absorbs the remainder into one clamped Fry, so this is one capped fish, not three.
    expect(fish()).toHaveLength(1);
    expect(fish()[0].xp).toBe(GROWTH.xpPerStage);
  });

  it('caps every fish, making a merge immediately available', async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText(/Spawn a .* fry/));
    await fireEvent.press(screen.getByText(/Spawn a .* fry/));
    await fireEvent.press(screen.getByText(/Spawn a .* fry/));
    expect(fish()).toHaveLength(3);

    await fireEvent.press(screen.getByText('Cap all fish (max XP)'));

    expect(fish().every((f) => f.xp === GROWTH.xpPerStage)).toBe(true);
    const merge = useAppStore.getState().mergeFish(
      fish().map((f) => f.id),
      1_700_000_000_000,
    );
    expect(merge.ok).toBe(true);
  });

  it('spawns the species its button names', async () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Spawn a Golden Koi fry'));

    expect(fish()[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('names the species the store would really spawn, not an unowned active id', async () => {
    // `activeSpeciesId` is the one settings field that can name a species the user does not own
    // (a hand-edited or future-refunded payload). The store falls back to the starter; the label
    // has to fall back with it, or the button lies about what it is about to do.
    useAppStore.setState((s) => ({
      settings: { ...s.settings, activeSpeciesId: GOLDEN_KOI_SPECIES_ID },
    }));
    await render(<SettingsScreen />);

    expect(screen.queryByText('Spawn a Golden Koi fry')).toBeNull();
    await fireEvent.press(screen.getByText('Spawn a Coral Tetra fry'));

    expect(fish()[0].speciesId).toBe(STARTER_SPECIES_ID);
  });

  it('leaves stats and the streak alone — no debug action fakes accountability', async () => {
    const before = useAppStore.getState().stats;
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('+1000 XP'));
    await fireEvent.press(screen.getByText('Cap all fish (max XP)'));
    await fireEvent.press(screen.getByText(/Spawn a .* fry/));

    expect(useAppStore.getState().stats).toEqual(before);
  });
});
