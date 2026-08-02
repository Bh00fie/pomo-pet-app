/**
 * The Settings screen's **debug panel** (added post-M6a review, updated for the reward
 * rearchitecture — see CLAUDE.md), plus the one thing about this screen that is not covered
 * anywhere else: that it can actually be reached.
 *
 * The store-level tests in `src/store/__tests__/useAppStore.test.ts` already pin what
 * `debugHatchFry`/`debugHatchJuvenile` *do*. What they cannot see is the wiring: a button labelled
 * "Hatch a Golden Koi Fry" that hands over a Coral Tetra because the label read
 * `settings.activeSpeciesId` while the action re-validated it against entitlements. Both are
 * invisible to a pure-logic test and both are exactly the kind of thing the user would then
 * mis-diagnose as a store bug on device.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { GOLDEN_KOI_SPECIES_ID, STARTER_SPECIES_ID } from '@/features/pet/model';
import { useAppStore } from '@/store';
import { SettingsScreen } from '../SettingsScreen';

const fish = () => useAppStore.getState().fish;

beforeEach(() => {
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true });
});

describe('SettingsScreen — debug panel wiring (post-M6a review, reward-rearchitecture update)', () => {
  it('labels itself as testing-only so it can never be mistaken for a shipped feature', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText(/DEBUG — TESTING ONLY/)).toBeTruthy();
  });

  it('no longer offers XP or cap controls — that mechanic does not exist anymore', async () => {
    await render(<SettingsScreen />);
    expect(screen.queryByText(/XP/)).toBeNull();
    expect(screen.queryByText(/Cap all fish/)).toBeNull();
  });

  it('hatches a Fry of the active species when its button is pressed', async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Hatch a Coral Tetra Fry'));

    expect(fish()).toHaveLength(1);
    expect(fish()[0]).toMatchObject({ speciesId: STARTER_SPECIES_ID, stage: 'fry', health: 'healthy' });
  });

  it('assembles a mergeable trio by pressing the Fry button three times', async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Hatch a Coral Tetra Fry'));
    await fireEvent.press(screen.getByText('Hatch a Coral Tetra Fry'));
    await fireEvent.press(screen.getByText('Hatch a Coral Tetra Fry'));

    expect(fish()).toHaveLength(3);
    const merge = useAppStore.getState().mergeFish(
      fish().map((f) => f.id),
      1_700_000_000_000,
    );
    expect(merge.ok).toBe(true);
    expect(useAppStore.getState().fish[0].stage).toBe('juvenile');
  });

  it('hatches the species its Fry button names, once a different species is active', async () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Hatch a Golden Koi Fry'));

    expect(fish()[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('names the species the store would really hatch, not an unowned active id', async () => {
    // `activeSpeciesId` is the one settings field that can name a species the user does not own
    // (a hand-edited or future-refunded payload). The store falls back to the starter; the label
    // has to fall back with it, or the button lies about what it is about to do.
    useAppStore.setState((s) => ({
      settings: { ...s.settings, activeSpeciesId: GOLDEN_KOI_SPECIES_ID },
    }));
    await render(<SettingsScreen />);

    expect(screen.queryByText('Hatch a Golden Koi Fry')).toBeNull();
    await fireEvent.press(screen.getByText('Hatch a Coral Tetra Fry'));

    expect(fish()[0].speciesId).toBe(STARTER_SPECIES_ID);
  });

  it('hatches a Juvenile of some owned species when the random-species button is pressed', async () => {
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Hatch a Juvenile (random species)'));

    expect(fish()).toHaveLength(1);
    expect(fish()[0].stage).toBe('juvenile');
    expect(fish()[0].speciesId).toBe(STARTER_SPECIES_ID); // the only species owned by default
  });

  it('leaves stats and the streak alone — no debug action fakes accountability', async () => {
    const before = useAppStore.getState().stats;
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Hatch a Coral Tetra Fry'));
    await fireEvent.press(screen.getByText('Hatch a Juvenile (random species)'));

    expect(useAppStore.getState().stats).toEqual(before);
  });

  it('leaves fish health alone — hatching is not a way to cure or sicken anything', async () => {
    useAppStore.setState({
      fish: [{ id: 'sick-fish', speciesId: STARTER_SPECIES_ID, stage: 'fry', bornAt: 0, health: 'sick' }],
    });
    await act(async () => {}); // let the store settle before rendering
    await render(<SettingsScreen />);

    await fireEvent.press(screen.getByText('Hatch a Coral Tetra Fry'));

    expect(useAppStore.getState().fish.find((f) => f.id === 'sick-fish')?.health).toBe('sick');
  });
});
