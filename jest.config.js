/**
 * Every test runs in a fixed, DST-observing timezone.
 *
 * This has to happen *here*, in the config Jest loads in its parent process before any worker is
 * forked — assigning `process.env.TZ` from inside a test (or from `setupFilesAfterEach`) is
 * silently ignored, because the runtime has already resolved its zone by then. That failure is
 * invisible: the code under test still runs, just in the machine's own zone, so a "DST" test
 * quietly becomes a plain 24-hour-day test that any naive implementation passes. The streak date
 * math (`src/features/streak/streak.ts`) is the thing this exists for; it asserts the zone it
 * expects rather than trusting this line.
 *
 * America/New_York is chosen only because its transition instants are well known and stable.
 */
process.env.TZ = 'America/New_York';

/**
 * `jest-expo` is the Expo-maintained preset — it applies the project's Babel config, wires the
 * React Native module mocks, and sets the platform globals the RN runtime expects.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Mirrors the `@/*` path alias in tsconfig.json.
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
