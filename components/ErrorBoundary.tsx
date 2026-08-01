import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';

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
      <View className="flex-1 bg-ink items-center justify-center px-6">
        <Text className="text-white font-display text-lg uppercase tracking-tight mb-2">
          Algo deu errado
        </Text>
        <Text className="text-slate-400 text-sm text-center mb-4">
          Um erro inesperado interrompeu a tela atual.
        </Text>
        <ScrollView className="max-h-32 mb-6 w-full">
          <Text className="text-slate-500 text-xs">{error.message}</Text>
        </ScrollView>
        <Pressable
          className="bg-red-600 px-8 py-3 rounded-control items-center"
          onPress={() => this.setState({ error: null })}
        >
          <Text className="text-white font-bold">TENTAR NOVAMENTE</Text>
        </Pressable>
      </View>
    );
  }
}
