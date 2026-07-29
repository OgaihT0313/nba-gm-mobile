// babel-preset-expo auto-includes the react-native-reanimated / worklets plugin
// when reanimated is installed (confirmed for SDK 57), so we don't add it here.
// NativeWind needs the `jsxImportSource` preset option + its own preset.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
