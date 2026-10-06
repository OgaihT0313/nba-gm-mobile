import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { IconName } from './Icon';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, FONT } from '../src/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// "Transmissão" nav: text only, no icon chips. The active tab is marked by a
// 20x3 stroke in the team's primary above its label.
const NavLabel: React.FC<{ active: boolean; label: string; color: string }> = ({ active, label, color }) => (
  <View className="items-center" style={{ gap: 7 }}>
    <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: active ? color : 'transparent' }} />
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 1, color: active ? COLORS.text : COLORS.dim, textTransform: 'uppercase' }}
    >
      {label}
    </Text>
  </View>
);

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
  const insets = useSafeAreaInsets();

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

  // The offseason phase that is open takes the Playoffs slot. There are no
  // playoffs in July, and the draft and free agency are the only screens that
  // matter then -- they used to sit two taps deep behind "Mais" on exactly the
  // night they were open.
  const phaseItem = draftOpen
    ? MORE_ITEMS.find((i) => i.id === 'draft')!
    : faOpen
      // "Agência Livre" doesn't fit a fifth of a phone next to "Trocas".
      ? { ...MORE_ITEMS.find((i) => i.id === 'free-agency')!, label: 'Mercado' }
      : null;
  const primaryItems = PRIMARY_ITEMS.map((item) => (item.id === 'playoffs' && phaseItem ? phaseItem : item));
  const moreActive = MORE_ITEMS.some((item) => item.id === view && item.id !== phaseItem?.id);

  return (
    <>
      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <Pressable accessible={false} className="flex-1 bg-black/60 justify-end" onPress={() => setMoreOpen(false)}>
          <Pressable
            style={{ backgroundColor: COLORS.navBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 14, paddingBottom: 14 + insets.bottom }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="self-center mb-3" style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.lineStrong }} />
            <View style={{ gap: 6 }}>
              {MORE_ITEMS.map((item) => {
                const disabled = isDisabled(item.id);
                const active = view === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => navigate(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    aria-disabled={disabled} aria-selected={active}
                    className="active:opacity-75"
                    style={{
                      minHeight: 46, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center',
                      backgroundColor: active ? COLORS.ctaFill : COLORS.surface, opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.cond700, fontSize: 16, letterSpacing: 1.2, color: active ? COLORS.ctaInk : COLORS.text, textTransform: 'uppercase' }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View
        className="flex-row"
        style={{ backgroundColor: COLORS.navBg, borderTopWidth: 1, borderTopColor: COLORS.navLine, height: 64 }}
      >
        {primaryItems.map((item) => {
          const disabled = isDisabled(item.id);
          const active = view === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => navigate(item.id)}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              aria-disabled={disabled} aria-selected={active}
              className="flex-1 items-center justify-center"
              style={{ opacity: disabled ? 0.3 : 1, paddingHorizontal: 2 }}
            >
              <NavLabel active={active} label={item.label} color={accent.primary} />
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setMoreOpen(true)}
          accessibilityRole="tab"
          accessibilityLabel="Mais"
          aria-selected={moreActive}
          className="flex-1 items-center justify-center"
        >
          <NavLabel active={moreActive} label="Mais" color={accent.primary} />
        </Pressable>
      </View>
    </>
  );
};

export default BottomNav;
