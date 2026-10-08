import React from 'react';
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

if (Platform.OS === 'web') {
  require('./src/web/desktopFrame').installDesktopFrame();
}

function Root() {
  return React.createElement(ErrorBoundary, null, React.createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
