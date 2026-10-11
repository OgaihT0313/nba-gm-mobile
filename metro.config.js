const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// One copy of three. Its package.json maps `import` to three.module.js and
// `require` to three.cjs, and Metro honours both: our code imports, while
// @react-three/fiber requires, so the bundle carried two three.js builds
// ("Multiple instances of Three.js being imported" in the log) — twice the
// code, and classes that fail instanceof checks across the two.
const threeEntry = require.resolve('three');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeEntry };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
