import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { IconName } from '../components/Icon';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK } from '../src/theme/tokens';
import { HeroTitle } from '../components/ui/kit';

// Fallback for a view id with no screen behind it (e.g. Draft/Agência Livre
// tapped outside the offseason window). Pads for the status bar itself, since
// the redesign removed the app-level header that used to do it.
const Placeholder: React.FC<{ title: string; icon?: IconName }> = ({ title, icon = 'simulation' }) => {
  const { accent } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ backgroundColor: COLORS.bg, paddingTop: insets.top, gap: 16 }}
    >
      <Icon name={icon} size={44} color={accent.primary} />
      <HeroTitle size={24} style={{ textAlign: 'center' }}>{title}</HeroTitle>
      <Text style={{ fontSize: 12, lineHeight: 18, color: INK.body, textAlign: 'center' }}>
        Esta seção só abre na fase certa da temporada.
      </Text>
    </View>
  );
};

export default Placeholder;
