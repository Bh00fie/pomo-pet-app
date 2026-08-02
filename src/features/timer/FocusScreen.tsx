import { Pressable, StyleSheet, View } from 'react-native';

import { getSpecies } from '@/features/pet/model';
import { classifySessionLength } from '@/features/pet/reward';
import { selectHydrated, selectSettings, selectSpawnSpeciesId, selectStats, useAppStore } from '@/store';
import { colors, radius, spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';
import { isAtSessionBound, stepSessionMinutes } from './durations';
import type { TimerMode } from './machine';
import { useTimer } from './useTimer';

/**
 * M1 — the timer screen. Everything shown here is derived from the state machine's `endsAt`
 * (see `machine.ts`); this component holds no timing logic of its own.
 */
export function FocusScreen() {
  const hydrated = useAppStore(selectHydrated);
  const settings = useAppStore(selectSettings);
  const setSettings = useAppStore((s) => s.setSettings);
  const stats = useAppStore(selectStats);
  // `selectSpawnSpeciesId`, not `settings.activeSpeciesId` directly — same reasoning as the
  // debug panel: it re-validates against ownership, so the preview can never name a species the
  // active session would not actually hatch.
  const activeSpeciesName = getSpecies(useAppStore(selectSpawnSpeciesId)).name;
  const timer = useTimer();

  const otherMode: TimerMode = timer.mode === 'focus' ? 'break' : 'focus';

  return (
    <Screen>
      <View style={styles.body}>
        <Text variant="caption" color={timer.isRunning ? 'kelp' : 'textMuted'}>
          {statusLabel(timer.mode, timer.status)}
        </Text>

        {stats.currentStreak > 0 && (
          <Text variant="caption" color="sun">
            {stats.currentStreak}-day streak
          </Text>
        )}

        <Text variant="display">{timer.clock}</Text>

        <View style={styles.track} accessibilityRole="progressbar">
          <View style={[styles.fill, { width: `${Math.round(timer.progress * 100)}%` }]} />
        </View>

        {timer.isIdle ? (
          <ModeSwitch mode={timer.mode} onChange={timer.setMode} />
        ) : (
          <Text variant="label" color="textMuted">
            {Math.round(timer.durationMs / 60_000)} min {timer.mode === 'focus' ? 'focus' : 'break'}
          </Text>
        )}

        <View style={styles.actions}>
          {timer.isIdle && (
            <Button
              label={timer.mode === 'focus' ? 'Start focus session' : 'Start break'}
              disabled={!hydrated}
              onPress={() => timer.start()}
            />
          )}

          {timer.isRunning && (
            <>
              <Button label="Pause" onPress={timer.pause} />
              <Button label="Give up" variant="ghost" onPress={timer.abandon} />
            </>
          )}

          {timer.isPaused && (
            <>
              <Button label="Resume" onPress={timer.resume} />
              <Button label="Reset" variant="ghost" onPress={timer.reset} />
            </>
          )}

          {(timer.isCompleted || timer.isAbandoned) && (
            <>
              <Button
                label={otherMode === 'break' ? 'Start break' : 'Start focus session'}
                onPress={() => timer.start(otherMode)}
              />
              <Button label="Reset" variant="ghost" onPress={timer.reset} />
            </>
          )}
        </View>
      </View>

      {timer.isIdle ? (
        <Card>
          <Text variant="label" color="textMuted">
            SESSION LENGTHS
          </Text>
          <LengthRow
            label="Focus"
            minutes={settings.workMinutes}
            onChange={(workMinutes) => setSettings({ workMinutes })}
          />
          <HatchPreview workMinutes={settings.workMinutes} activeSpeciesName={activeSpeciesName} />
          <LengthRow
            label="Break"
            minutes={settings.shortBreakMinutes}
            onChange={(shortBreakMinutes) => setSettings({ shortBreakMinutes })}
          />
        </Card>
      ) : (
        <Card>
          <Text variant="label" color="textMuted">
            {timer.isCompleted ? 'SESSION COMPLETE' : 'IN SESSION'}
          </Text>
          <Text color="textMuted">{sessionHint(timer.status, timer.mode)}</Text>
        </Card>
      )}
    </Screen>
  );
}

function statusLabel(mode: TimerMode, status: string): string {
  if (status === 'paused') return 'PAUSED';
  if (status === 'completed') return mode === 'focus' ? 'FOCUS COMPLETE' : 'BREAK OVER';
  if (status === 'abandoned') return 'SESSION ABANDONED';
  return mode === 'focus' ? 'FOCUS' : 'BREAK';
}

function sessionHint(status: string, mode: TimerMode): string {
  switch (status) {
    case 'running':
      return mode === 'focus'
        ? 'Stay in the app. A quick lock-screen glance is fine, but leaving for more than a few seconds marks a fish sick — even if the timer would have finished before you got back.'
        : 'The timer runs on wall-clock time and a notification fires when it ends.';
    case 'paused':
      return 'Paused. Remaining time is held exactly where you left it.';
    case 'completed':
      return mode === 'focus'
        ? 'Session finished. Check the Aquarium tab — your fish grew.'
        : 'Break over. Back to focus when you are ready.';
    default:
      return 'Session ended early. Nothing was awarded.';
  }
}

function ModeSwitch({ mode, onChange }: { mode: TimerMode; onChange: (mode: TimerMode) => void }) {
  return (
    <View style={styles.switch}>
      {(['focus', 'break'] as const).map((option) => {
        const selected = option === mode;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={option === 'focus' ? 'Focus mode' : 'Break mode'}
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text variant="label" color={selected ? 'text' : 'textMuted'}>
              {option === 'focus' ? 'Focus' : 'Break'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Live pre-session hatch preview (post-XP reward rearchitecture — see CLAUDE.md), next to the
 * Focus duration stepper so it updates the moment the user adjusts the length, exactly like the
 * concept wireframe: the current `workMinutes` setting alone decides the stage
 * (`classifySessionLength`), so this needs no store write of its own to stay in sync.
 *
 * The long-session branch deliberately never names a species — it genuinely isn't knowable until
 * the session completes, since `pickRandomSpeciesId` draws from the whole owned pool at hatch
 * time, not from whatever happens to be active right now.
 */
function HatchPreview({
  workMinutes,
  activeSpeciesName,
}: {
  workMinutes: number;
  activeSpeciesName: string;
}) {
  const long = classifySessionLength(workMinutes) === 'long';
  return (
    <View style={styles.hatchPreview}>
      <Text variant="label" color="textMuted">
        YOU'LL HATCH
      </Text>
      <Text color="textMuted">
        {long ? 'A Juvenile — a random species from your collection' : `A Fry — ${activeSpeciesName}`}
      </Text>
    </View>
  );
}

function LengthRow({
  label,
  minutes,
  onChange,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <View style={styles.lengthRow}>
      <Text color="textMuted">{label}</Text>
      <View style={styles.stepper}>
        <Stepper
          label={`Decrease ${label.toLowerCase()} length`}
          symbol="−"
          disabled={isAtSessionBound(minutes, -1)}
          onPress={() => onChange(stepSessionMinutes(minutes, -1))}
        />
        <Text variant="heading" style={styles.minutes}>
          {minutes}
        </Text>
        <Stepper
          label={`Increase ${label.toLowerCase()} length`}
          symbol="+"
          disabled={isAtSessionBound(minutes, 1)}
          onPress={() => onChange(stepSessionMinutes(minutes, 1))}
        />
        <Text color="textFaint">min</Text>
      </View>
    </View>
  );
}

function Stepper({
  label,
  symbol,
  disabled,
  onPress,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && styles.pressed, disabled && styles.stepOff]}
    >
      <Text variant="heading" color={disabled ? 'textFaint' : 'text'}>
        {symbol}
      </Text>
    </Pressable>
  );
}

const TRACK_WIDTH = 240;

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  track: {
    width: TRACK_WIDTH,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.coral },
  actions: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  switch: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  segment: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  segmentSelected: { backgroundColor: colors.surfaceRaised },
  lengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  minutes: { minWidth: 32, textAlign: 'center' },
  step: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  stepOff: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
  hatchPreview: {
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
