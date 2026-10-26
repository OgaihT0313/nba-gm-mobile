import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';

import { deleteSave } from '../services/saveService';
import { deleteCareer } from '../services/career/careerSave';
import { COLORS } from '../src/theme/tokens';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Last-resort safety net: before this existed, any uncaught render/effect
// error anywhere in the tree white-screened the app with zero feedback and no
// log line to debug from. componentDidCatch logs to the console (visible via
// Metro / `adb logcat`) and the fallback lets the user retry without force-
// closing — recoverable if the error was a one-off (a stray null in a single
// render pass), a no-op if it's a real bug that'll throw again immediately.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] uncaught error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      // Rendered outside the ThemeProvider, so the bg-ink class variable isn't
      // set here: the color comes straight from the live palette.
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: COLORS.bg }}>
        {/* Colors from the live palette, not fixed classes: white text was
            invisible on the light theme's background. */}
        <Text className="font-display text-lg uppercase tracking-tight mb-2" style={{ color: COLORS.text }}>
          Algo deu errado
        </Text>
        <Text className="text-sm text-center mb-4" style={{ color: COLORS.muted }}>
          Um erro inesperado interrompeu a tela atual.
        </Text>
        <ScrollView className="max-h-32 mb-6 w-full">
          <Text className="text-xs" style={{ color: COLORS.dim }}>{error.message}</Text>
        </ScrollView>
        <Pressable accessibilityRole="button"
          className="px-8 py-3 rounded-control items-center"
          style={{ backgroundColor: COLORS.bad }}
          onPress={() => this.setState({ error: null })}
        >
          <Text className="font-bold" style={{ color: '#ffffff' }}>TENTAR NOVAMENTE</Text>
        </Pressable>
        {/* The way out when a saved game itself is what breaks the screen:
            retrying would just load it again. Either mode can be the one that
            breaks, so each has its own button. */}
        <Pressable accessibilityRole="button"
          className="mt-3 px-8 py-3 items-center"
          onPress={() => { deleteSave(); this.setState({ error: null }); }}
        >
          <Text className="text-xs" style={{ color: COLORS.muted }}>APAGAR O SAVE DO GM (ESPAÇO ATUAL)</Text>
        </Pressable>
        <Pressable accessibilityRole="button"
          className="px-8 py-3 items-center"
          onPress={() => { deleteCareer(); this.setState({ error: null }); }}
        >
          <Text className="text-xs" style={{ color: COLORS.muted }}>APAGAR A MINHA CARREIRA</Text>
        </Pressable>
      </View>
    );
  }
}
