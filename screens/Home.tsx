import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

import Card from '../components/Card';
import Icon, { IconName } from '../components/Icon';
import Logo from '../components/Logo';
import { useTheme } from '../src/theme/ThemeProvider';

// RN port of the web's `renderHome` hero. The backdrop keeps the same three
// decorative layers (court photo → dark gradient → accent glow), but the glow
// is an SVG radial gradient instead of the web's `blur-[120px]` circle — RN has
// no CSS filter, and a plain rounded View would render as a hard-edged disc.
// The two faded star photos are dropped: they were `lg:`-only on the web, so
// they never showed at phone width anyway.

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'teams', title: '30 Times', body: 'Rosters atualizados e estatísticas reais.' },
  { icon: 'trending', title: 'Evolução', body: 'Jogadores evoluem e regridem com o tempo.' },
  { icon: 'cup', title: 'Playoffs', body: 'Simulação completa até o anel de campeão.' },
];

const Home: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const { accent } = useTheme();

  return (
    <ScrollView className="flex-1">
      <View className="relative">
        {/* Decorative backdrop — never intercepts touches. */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
          {/* `loading="eager"` (web-only prop) is required, not cosmetic:
              expo-image defaults to loading="lazy" on web, and the browser never
              fires the load for this absolutely-positioned backdrop — the court
              silently stays blank. No effect on native. */}
          <Image
            source={require('../assets/court-bg.png')}
            style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
            contentFit="cover"
            loading="eager"
          />
          <LinearGradient
            colors={['rgba(2,6,23,0.2)', 'rgba(2,6,23,0.6)', '#020617']}
            style={StyleSheet.absoluteFill}
          />
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="30%" r="60%">
                <Stop offset="0" stopColor={accent.primary} stopOpacity={0.28} />
                <Stop offset="1" stopColor={accent.primary} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
          </Svg>
        </View>

        <View className="px-5 py-12 gap-10">
          <View className="items-center gap-3">
            <View
              className="w-20 h-20 rounded-hero items-center justify-center bg-accent"
              style={{ backgroundColor: accent.primary }}
            >
              <Logo size={44} color="#ffffff" />
            </View>
            <Text className="text-5xl font-display uppercase text-white text-center">
              NBA Simulator
            </Text>
            <Text className="text-base text-slate-400 font-medium text-center">
              Simulação imparcial e completa da temporada 2025-26
            </Text>
          </View>

          {/* The translucent card fill is an inline style, not a `bg-slate-900/60`
              class: Card already sets bg-slate-900, and NativeWind resolves that
              conflict by stylesheet order rather than class-string order. */}
          <View className="gap-3">
            {FEATURES.map((f) => (
              <Card key={f.title} padding="lg" hero style={{ backgroundColor: 'rgba(15,23,42,0.6)' }}>
                <Icon name={f.icon} size={30} color={accent.primary} strokeWidth={1.6} />
                <Text className="font-bold text-lg text-white mt-4">{f.title}</Text>
                <Text className="text-sm text-slate-500 mt-1.5">{f.body}</Text>
              </Card>
            ))}
          </View>

          <View className="items-center pt-2">
            <Pressable
              onPress={onStart}
              className="bg-white px-10 py-5 rounded-full active:opacity-80"
            >
              <Text className="text-black text-lg font-black tracking-tight">INICIAR TEMPORADA</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default Home;
