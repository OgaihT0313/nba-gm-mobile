import React from 'react';
import { View, Text, ScrollView } from 'react-native';

import { COLORS, FONT } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';
import { TeamBadge } from '../ui/kit';
import { Ball } from '../BrandLogo';
import { Hover } from './kit';

// PC Sidebar: the BottomNav laid out as a fixed 232px column with every item
// visible. Same items, same disabled rule, same phase swap (draft / free agency
// take the Playoffs slot) — only the place changed.

interface Item { id: string; label: string }

const PRIMARY: Item[] = [
  { id: 'simulation', label: 'Simulação' },
  { id: 'my-team', label: 'Meu Time' },
  { id: 'trade', label: 'Trocas' },
  { id: 'playoffs', label: 'Playoffs' },
];

const MORE: Item[] = [
  { id: 'home', label: 'Início' },
  { id: 'teams', label: 'Franquias' },
  { id: 'scout', label: 'Scout' },
  { id: 'draft', label: 'Draft' },
  { id: 'free-agency', label: 'Agência Livre' },
  { id: 'standings', label: 'Classificação' },
  { id: 'leaders', label: 'Líderes' },
  { id: 'awards', label: 'Prêmios' },
  { id: 'allstar', label: 'All-Star' },
];

interface SidebarProps {
  view: string;
  onNavigate: (view: string) => void;
  hasSeason: boolean;
  faOpen: boolean;
  draftOpen: boolean;
  teamId: string;
  nickname: string;
  /** "JOGO 50/82", "DRAFT", "AGÊNCIA LIVRE"... */
  caption: string;
  /** The owner's confidence zone color. */
  zoneColor: string;
}

const Sidebar: React.FC<SidebarProps> = ({ view, onNavigate, hasSeason, faOpen, draftOpen, teamId, nickname, caption, zoneColor }) => {
  const { accent } = useTheme();

  const isDisabled = (id: string) => {
    if (id === 'free-agency') return !faOpen;
    if (id === 'draft') return !draftOpen;
    return id !== 'home' && id !== 'teams' && id !== 'scout' && !hasSeason;
  };

  const phaseItem = draftOpen
    ? MORE.find((i) => i.id === 'draft')!
    : faOpen ? { id: 'free-agency', label: 'Mercado' } : null;
  const primary = PRIMARY.map((i) => (i.id === 'playoffs' && phaseItem ? phaseItem : i));
  const more = MORE.filter((i) => !primary.some((p) => p.id === i.id));

  const row = (item: Item, big: boolean) => {
    const active = view === item.id;
    const disabled = isDisabled(item.id);
    return (
      <Hover
        key={item.id}
        onPress={() => onNavigate(item.id)}
        disabled={disabled}
        selected={active}
        accessibilityLabel={item.label}
        hoverStyle={{ backgroundColor: COLORS.surface }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, height: big ? 42 : 36, paddingHorizontal: 12, borderRadius: 10,
          backgroundColor: active ? COLORS.surface : 'transparent', opacity: disabled && !active ? 0.35 : 1,
        }}
      >
        <View style={{ width: 3, height: big ? 20 : 16, borderRadius: 2, backgroundColor: active ? accent.primary : 'transparent' }} />
        <Text style={{ fontFamily: FONT.cond700, fontSize: big ? 15 : 14, letterSpacing: (big ? 15 : 14) * 0.08, color: active ? COLORS.text : COLORS.dim, textTransform: 'uppercase' }}>
          {item.label}
        </Text>
      </Hover>
    );
  };

  return (
    <View style={{ width: 232, flexShrink: 0, backgroundColor: COLORS.navBg, borderRightWidth: 1, borderRightColor: COLORS.line }}>
      {/* BrandLogo at 0.48 */}
      <Hover onPress={() => onNavigate('home')} hoverStyle={{ opacity: 0.85 }} style={{ paddingTop: 28, paddingHorizontal: 24, paddingBottom: 26 }}>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          <View style={{ width: 15, height: 3, backgroundColor: COLORS.west }} />
          <View style={{ width: 15, height: 3, backgroundColor: COLORS.east }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 46, lineHeight: 40, letterSpacing: -0.46, color: COLORS.text }}>NBA</Text>
          <Ball size={34} />
        </View>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 12.5, lineHeight: 12.5, letterSpacing: 4.5, color: COLORS.text, marginTop: 5 }}>MANAGER</Text>
      </Hover>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 2 }}>
        {primary.map((i) => row(i, true))}
        <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.65, color: COLORS.faint, paddingTop: 18, paddingHorizontal: 12, paddingBottom: 8 }}>MAIS</Text>
        {more.map((i) => row(i, false))}
      </ScrollView>

      <View style={{ margin: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TeamBadge teamId={teamId} width={34} height={22} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: 16, lineHeight: 17.6, color: COLORS.text }}>{nickname}</Text>
          <Text numberOfLines={1} style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.3, color: COLORS.muted, textTransform: 'uppercase' }}>{caption}</Text>
        </View>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: zoneColor }} />
      </View>
    </View>
  );
};

export default Sidebar;
