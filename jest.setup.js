/* eslint-env jest */

// The persisted zustand store talks to AsyncStorage on import; the official mock keeps that
// in-memory instead of reaching for a native module that does not exist under Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `Screen` reads safe-area insets; the library's own mock supplies static metrics so screens can
// be rendered without wrapping every test in a provider.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
