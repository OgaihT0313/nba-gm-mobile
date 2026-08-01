import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon, { IconName } from './Icon';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, onAccent } from '../src/theme/tokens';

// The rounded 20px square behind each tab icon. Active gets the franchise
// gradient; idle gets the flat navy chip.
const NavChip: React.FC<{ active: boolean; icon: IconName; accent: { primary: string; secondary: string } }> = ({
  active,
  icon,
  accent,
}) => {
  const box = { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' } as const;
  return active ? (
    <LinearGradient colors={[accent.primary, accent.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>
      <Icon name={icon} size={17} color="#ffffff" strokeWidth={2} />
    </LinearGradient>
  ) : (
    <View style={[box, { backgroundColor: COLORS.navIdleChip }]}>
      <Icon name={icon} size={17} color={COLORS.navIdle} strokeWidth={1.8} />
    </View>
  );
};

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
            className="rounded-t-3xl p-4 pb-8"
            style={{ backgroundColor: COLORS.navBg, borderTopWidth: 1, borderTopColor: COLORS.navLine }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="w-10 h-1 rounded-full self-center mb-4" style={{ backgroundColor: COLORS.line }} />
            <View className="flex-row flex-wrap justify-between">
              {MORE_ITEMS.map((item) => {
                const disabled = isDisabled(item.id);
                const active = view === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => navigate(item.id)}
                    className={`w-[31%] mb-3 items-center justify-center gap-2 py-4 rounded-2xl ${disabled ? 'opacity-30' : ''}`}
                    style={{
                      backgroundColor: active ? accent.primary : COLORS.panel,
                      borderWidth: 1,
                      borderColor: active ? accent.primary : COLORS.line,
                    }}
                  >
                    <Icon name={item.icon} size={22} color={active ? onAccent(accent.primary) : '#cbd5e1'} />
                    <Text
                      className="text-[10px] font-bold uppercase tracking-wide text-center"
                      style={{ color: active ? onAccent(accent.primary) : '#cbd5e1' }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* The redesign's nav: darker than the page, its own hairline, and the
          active tab marked by the team's own primary→secondary gradient rather
          than a tinted icon — the only place in the chrome the franchise color
          appears once you've scrolled past a screen's hero. */}
      <View
        className="flex-row"
        style={{ backgroundColor: COLORS.navBg, borderTopWidth: 1, borderTopColor: COLORS.navLine, paddingTop: 7, paddingBottom: 9 }}
      >
        {PRIMARY_ITEMS.map((item) => {
          const disabled = isDisabled(item.id);
          const active = view === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => navigate(item.id)}
              className={`flex-1 items-center justify-center gap-1.5 py-1 ${disabled ? 'opacity-30' : ''}`}
            >
              <NavChip active={active} icon={item.icon} accent={accent} />
              <Text
                className={active ? 'text-[8.5px] font-black' : 'text-[8.5px] font-semibold'}
                style={{ color: active ? '#fff' : COLORS.navIdle }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setMoreOpen(true)} className="flex-1 items-center justify-center gap-1.5 py-1">
          <NavChip active={moreActive} icon="menu" accent={accent} />
          <Text
            className={moreActive ? 'text-[8.5px] font-black' : 'text-[8.5px] font-semibold'}
            style={{ color: moreActive ? '#fff' : COLORS.navIdle }}
          >
            Mais
          </Text>
        </Pressable>
      </View>
    </>
  );
};

export default BottomNav;
