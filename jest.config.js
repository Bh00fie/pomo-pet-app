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
