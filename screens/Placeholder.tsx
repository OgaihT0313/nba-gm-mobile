import React from 'react';
import { View, Text } from 'react-native';
import Icon, { IconName } from '../components/Icon';
import { useTheme } from '../src/theme/ThemeProvider';

// Temporary stand-in for screens that land in Phase 3. Keeps the nav fully
// walkable so the shell can be verified end-to-end now.
const Placeholder: React.FC<{ title: string; icon?: IconName }> = ({ title, icon = 'simulation' }) => {
  const { accent } = useTheme();
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <Icon name={icon} size={48} color={accent.primary} />
      <Text className="text-2xl font-black uppercase italic text-white text-center">{title}</Text>
      <Text className="text-slate-500 text-sm text-center">Esta tela chega na Fase 3 da migração.</Text>
    </View>
  );
};

export default Placeholder;
