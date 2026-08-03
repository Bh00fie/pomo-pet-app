import { fireEvent, render, screen } from '@testing-library/react-native';

import { GOLDEN_KOI_SPECIES_ID, type Fish } from '@/features/pet/model';
import { SessionCompleteScreen } from '../SessionCompleteScreen';

const FISH: Fish = { id: 'f1', speciesId: GOLDEN_KOI_SPECIES_ID, stage: 'juvenile', bornAt: 1, health: 'healthy' };

describe('SessionCompleteScreen', () => {
  it('shows the session-complete moment and names what was earned', async () => {
    await render(
      <SessionCompleteScreen fish={FISH} durationMinutes={25} onStartAnother={jest.fn()} onSeeTank={jest.fn()} />,
    );

    expect(screen.getByText('Session complete')).toBeTruthy();
    expect(screen.getByText('25 minutes of focus, banked.')).toBeTruthy();
    expect(screen.getByText('A Golden Koi Juvenile hatched.')).toBeTruthy();
    expect(screen.getByText('See your tank')).toBeTruthy();
    expect(screen.getByText('Start another session')).toBeTruthy();
  });

  it('falls back to generic copy on the practically-unreachable no-fish edge case', async () => {
    await render(
      <SessionCompleteScreen fish={null} durationMinutes={25} onStartAnother={jest.fn()} onSeeTank={jest.fn()} />,
    );

    expect(screen.getByText('A new fish hatched.')).toBeTruthy();
  });

  it('wires "See your tank" and "Start another session" to their own callbacks', async () => {
    const onSeeTank = jest.fn();
    const onStartAnother = jest.fn();
    await render(
      <SessionCompleteScreen fish={FISH} durationMinutes={25} onStartAnother={onStartAnother} onSeeTank={onSeeTank} />,
    );

    await fireEvent.press(screen.getByText('See your tank'));
    expect(onSeeTank).toHaveBeenCalledTimes(1);
    expect(onStartAnother).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Start another session'));
    expect(onStartAnother).toHaveBeenCalledTimes(1);
  });
});
