module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must be listed last. Reanimated 4 delegates its Babel plugin to react-native-worklets.
    plugins: ['react-native-worklets/plugin'],
  };
};
