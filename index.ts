import React from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyThemeMode } from './src/theme/tokens';
import { loadThemeMode } from './services/prefsService';

// The saved light/dark mode goes into the live palette before anything renders.
applyThemeMode(loadThemeMode());

function Root() {
  return React.createElement(ErrorBoundary, null, React.createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
