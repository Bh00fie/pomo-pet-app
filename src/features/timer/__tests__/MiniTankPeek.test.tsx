import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID, STARTER_SPECIES_ID, type Fish } from '@/features/pet/model';
import { MiniTankPeek } from '../MiniTankPeek';

/** Same local Skia stub as `ShopScreen.test.tsx`/`FocusScreen.test.tsx` — `SpeciesSwatch` is
 *  decoration over the fish-selection logic under test, and nothing here reads a pixel. */
jest.mock('@shopify/react-native-skia', () => {
  const inert = () => null;
  return {
    __esModule: true,
    Canvas: ({ children }: { children?: React.ReactNode }) => children ?? null,
    Group: ({ children }: { children?: React.ReactNode }) => children ?? null,
    Circle: inert,
    Oval: inert,
    Path: inert,
    Rect: inert,
    Skia: { Path: { Make: () => ({ moveTo: inert, quadTo: inert, close: inert, addOval: inert }) } },
  };
});

function fishAt(id: string, bornAt: number, speciesId = STARTER_SPECIES_ID): Fish {
  return { id, speciesId, stage: 'fry', bornAt, health: 'healthy' };
}

describe('MiniTankPeek', () => {
  it('shows an empty-state hint with no fish', async () => {
    await render(<MiniTankPeek fish={[]} />);

    expect(screen.getByText('YOUR TANK')).toBeTruthy();
    expect(screen.getByText('Complete a session to hatch your first fish.')).toBeTruthy();
  });

  it('caps the peek at 3 fish, newest first, even with more in the collection', async () => {
    const fish = [
      fishAt('a', 1),
      fishAt('b', 4, GOLDEN_KOI_SPECIES_ID),
      fishAt('c', 2),
      fishAt('d', 3, INDIGO_BETTA_SPECIES_ID),
    ];

    await render(<MiniTankPeek fish={fish} />);

    // The 3 newest (d, b, c) show; the oldest (a) does not — the cap is the point of a "peek".
    expect(screen.getByTestId('mini-tank-peek-d')).toBeTruthy();
    expect(screen.getByTestId('mini-tank-peek-b')).toBeTruthy();
    expect(screen.getByTestId('mini-tank-peek-c')).toBeTruthy();
    expect(screen.queryByTestId('mini-tank-peek-a')).toBeNull();
  });

  it('renders no empty-state hint once there is at least one fish', async () => {
    await render(<MiniTankPeek fish={[fishAt('a', 1)]} />);

    expect(screen.queryByText('Complete a session to hatch your first fish.')).toBeNull();
  });
});
