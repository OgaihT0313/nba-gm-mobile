import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import Icon, { IconName } from './Icon';
import { useTheme } from '../src/theme/ThemeProvider';

interface NavItem {
  id: string;
  label: string;
  icon: IconName;
}

interface BottomNavProps {
  view: string;
  onNavigate: (view: string) => void;
  hasSeason: boolean;
  faOpen: boolean;
  draftOpen: boolean;
}

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'simulation', label: 'Simulação', icon: 'simulation' },
  { id: 'my-team', label: 'Meu Time', icon: 'my-team' },
  { id: 'trade', label: 'Trocas', icon: 'trade' },
  { id: 'playoffs', label: 'Playoffs', icon: 'playoffs' },
];

const MORE_ITEMS: NavItem[] = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'teams', label: 'Franquias', icon: 'teams' },
  { id: 'scout', label: 'Scout', icon: 'scout' },
  { id: 'draft', label: 'Draft', icon: 'draft' },
  { id: 'free-agency', label: 'Agência Livre', icon: 'free-agency' },
  { id: 'standings', label: 'Classificação', icon: 'standings' },
  { id: 'leaders', label: 'Líderes', icon: 'leaders' },
  { id: 'awards', label: 'Prêmios', icon: 'awards' },
  { id: 'allstar', label: 'All-Star', icon: 'all-star' },
];

const BottomNav: React.FC<BottomNavProps> = ({ view, onNavigate, hasSeason, faOpen, draftOpen }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { accent } = useTheme();

  useEffect(() => {
    setMoreOpen(false);
  }, [view]);

  const isDisabled = (id: string) => {
    if (id === 'free-agency') return !faOpen;
    if (id === 'draft') return !draftOpen;
    return id !== 'home' && id !== 'teams' && id !== 'scout' && !hasSeason;
  };

  const navigate = (id: string) => {
    if (isDisabled(id)) return;
    onNavigate(id);
    setMoreOpen(false);
  };

  const moreActive = MORE_ITEMS.some((item) => item.id === view);

  return (
    <>
      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setMoreOpen(false)}>
          <Pressable
            className="bg-slate-950 border-t border-slate-800 rounded-t-3xl p-4 pb-8"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="w-10 h-1 bg-slate-700 rounded-full self-center mb-4" />
            <View className="flex-row flex-wrap justify-between">
              {MORE_ITEMS.map((item) => {
                const disabled = isDisabled(item.id);
                const active = view === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => navigate(item.id)}
                    className={`w-[31%] mb-3 items-center justify-center gap-2 py-4 rounded-2xl ${
                      active ? 'bg-accent' : 'bg-slate-900'
                    } ${disabled ? 'opacity-30' : ''}`}
                  >
                    <Icon name={item.icon} size={22} color={active ? '#ffffff' : '#cbd5e1'} />
                    <Text className={`text-[10px] font-bold uppercase tracking-wide text-center ${active ? 'text-white' : 'text-slate-300'}`}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View className="flex-row bg-slate-950 border-t border-slate-900">
        {PRIMARY_ITEMS.map((item) => {
          const disabled = isDisabled(item.id);
          const active = view === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => navigate(item.id)}
              className={`flex-1 items-center justify-center gap-1 py-2.5 ${disabled ? 'opacity-30' : ''}`}
            >
              <Icon name={item.icon} size={21} color={active ? accent.primary : '#64748b'} strokeWidth={active ? 2 : 1.8} />
              <Text className="text-[9px] font-bold uppercase tracking-wide" style={{ color: active ? accent.primary : '#64748b' }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setMoreOpen(true)} className="flex-1 items-center justify-center gap-1 py-2.5">
          <Icon name="menu" size={21} color={moreActive ? accent.primary : '#64748b'} />
          <Text className="text-[9px] font-bold uppercase tracking-wide" style={{ color: moreActive ? accent.primary : '#64748b' }}>
            Mais
          </Text>
        </Pressable>
      </View>
    </>
  );
};

export default BottomNav;
