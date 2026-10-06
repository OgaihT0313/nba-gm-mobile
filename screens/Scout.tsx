import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Player, Team } from '../types';
import {
  getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getPlayerPositions,
  formatPositions, attributeColor,
} from '../constants';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, FONT, withAlpha, ovrColor } from '../src/theme/tokens';
import { ScreenTitle, BodyText, Name, PlayerFace } from '../components/ui/kit';
import PlayerDetailModal from '../components/PlayerDetailModal';
import ScoutAdvisor from '../components/ScoutAdvisor';

// Kept on FlatList rather than moved to <Screen>: this list is every player in
// the league (~530 rows), and the virtualisation is the reason it scrolls at
// all. The hero band is painted behind it manually so the screen still opens
// the way every other one does.

interface ScoutProps {
  players: { [key: string]: Player };
  teams: Team[];
  userTeamId: string;
}

const POSITION_FILTERS = [
  { id: 'TODOS', label: 'Todos' }, { id: 'PG', label: 'PG' }, { id: 'SG', label: 'SG' },
  { id: 'SF', label: 'SF' }, { id: 'PF', label: 'PF' }, { id: 'C', label: 'C' },
];
// Each row's "no filter" chip is labelled "Todas/Todos", never with the row's
// own name: labelling it "Idade" made the active chip read as a section header
// that happened to be highlighted, so the row looked like a title rather than a
// choice. The row name lives in the mono label above it instead.
const AGE_FILTERS = [
  { id: 'TODOS', label: 'Todas' }, { id: '<25', label: '<25' }, { id: '25-30', label: '25-30' }, { id: '30+', label: '30+' },
];
const OVR_FILTERS = [
  { id: 'TODOS', label: 'Todos' }, { id: '90+', label: '90+' }, { id: '80-89', label: '80-89' },
  { id: '70-79', label: '70-79' }, { id: '<70', label: '<70' },
];

const matchesAge = (age: number, f: string) =>
  f === '<25' ? age < 25 : f === '25-30' ? age >= 25 && age <= 30 : f === '30+' ? age > 30 : true;
const matchesOvr = (ovr: number, f: string) =>
  f === '90+' ? ovr >= 90 : f === '80-89' ? ovr >= 80 && ovr <= 89 : f === '70-79' ? ovr >= 70 && ovr <= 79 : f === '<70' ? ovr < 70 : true;

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// Combining-diacritics range, written as escapes so the source stays ASCII.
const DIACRITICS = /[̀-ͯ]/g;

// Accent-insensitive so "jokic" finds "Jokić" — half the league's names carry
// diacritics the user won't type on a phone keyboard.
const normalize = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

const Scout: React.FC<ScoutProps> = ({ players, teams, userTeamId }) => {
  const insets = useSafeAreaInsets();
  const { accent } = useTheme();
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('TODOS');
  const [ageFilter, setAgeFilter] = useState('TODOS');
  const [ovrFilter, setOvrFilter] = useState('TODOS');
  const [selected, setSelected] = useState<Player | null>(null);

  const userTeam = teams.find((t) => t.id === userTeamId);

  const teamByPlayerId = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((t) => t.roster.forEach((pId) => map.set(pId, t)));
    return map;
  }, [teams]);

  // An undrafted prospect's real rating is still under scouting fog — this
  // screen would hand it over for free, so it's excluded from the list AND
  // from the headline count.
  const visible = (p: Player) => !p.prospect;

  const activeCount = useMemo(
    () => (Object.values(players) as Player[]).filter(visible).length,
    [players],
  );

  const results = useMemo(() => {
    const q = normalize(query.trim());
    return (Object.entries(players) as [string, Player][])
      .filter(([, p]) => visible(p))
      .filter(([, p]) => q === '' || normalize(p.name).includes(q))
      .filter(([, p]) => posFilter === 'TODOS' || getPlayerPositions(p).includes(posFilter))
      .filter(([, p]) => matchesAge(p.age, ageFilter))
      .filter(([, p]) => matchesOvr(p.ovr, ovrFilter))
      .sort(([, a], [, b]) => b.ovr - a.ovr)
      .map(([id, p]) => ({ ...p, id, team: teamByPlayerId.get(id) }));
  }, [players, query, posFilter, ageFilter, ovrFilter, teamByPlayerId]);

  const header = (
    <View style={{ paddingTop: insets.top + 4 }}>
      <ScreenTitle title="Scout" />
      <BodyText size={14} style={{ paddingHorizontal: 20, marginTop: -10 }}>Olho na liga · {activeCount} jogadores</BodyText>

      <View style={{ paddingHorizontal: 14, marginTop: 12, gap: 10 }}>
        {userTeam ? <ScoutAdvisor userTeam={userTeam} teams={teams} players={players} onSelectPlayer={setSelected} /> : null}

        <View className="flex-row items-center" style={{ height: 46, borderRadius: 12, backgroundColor: COLORS.surface, paddingHorizontal: 14, gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar jogador…"
            placeholderTextColor={COLORS.faint}
            autoCorrect={false}
            autoCapitalize="none"
            style={{ flex: 1, fontFamily: FONT.body500, fontSize: 15, color: COLORS.text, paddingVertical: 10 }}
          />
          {query.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setQuery('')} hitSlop={8}>
              <Text style={{ color: COLORS.dim, fontSize: 18 }}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 7 }}>
          <FilterLine label="Posição" items={POSITION_FILTERS} value={posFilter} onChange={setPosFilter} />
          <FilterLine label="Idade" items={AGE_FILTERS} value={ageFilter} onChange={setAgeFilter} />
          <FilterLine label="Overall" items={OVR_FILTERS} value={ovrFilter} onChange={setOvrFilter} />
        </View>

        <View className="flex-row justify-between" style={{ paddingTop: 4, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.5, color: COLORS.faint }}>
            {results.length} {results.length === 1 ? 'JOGADOR' : 'JOGADORES'}
          </Text>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.5, color: COLORS.faint }}>IDADE · SALÁRIO · OVR</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 24 }}
        initialNumToRender={14}
        windowSize={8}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected(item)}
            className="flex-row items-center active:opacity-75"
            style={{ height: 54, gap: 10, marginHorizontal: 14, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}
          >
            <PlayerFace player={item} teamId={item.team?.id} size={36} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Name size={15}>{item.name}</Name>
              <Text style={{ fontFamily: FONT.body500, fontSize: 11.5, color: COLORS.dim }}>
                {formatPositions(item)} ·{' '}
                {item.team
                  ? <Text style={{ fontFamily: FONT.cond700, color: COLORS.textSoft }}>{item.team.id.toUpperCase()}</Text>
                  : <Text style={{ fontFamily: FONT.cond700, color: COLORS.good }}>LIVRE</Text>}
              </Text>
            </View>
            <Text style={{ fontFamily: FONT.cond600, fontSize: 12.5, color: COLORS.muted }}>{item.age}a · {money(item.salary)}</Text>
            <Text style={{ width: 28, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 20, color: ovrColor(item.ovr) }}>{item.ovr}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<BodyText color={COLORS.dim} style={{ paddingHorizontal: 20, paddingTop: 10 }}>Nenhum jogador encontrado.</BodyText>}
      />

      {selected ? <PlayerDetailModal player={selected} teamId={teamByPlayerId.get(selected.id)?.id} onClose={() => setSelected(null)} /> : null}
    </View>
  );
};

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

/** One filter line: label on the left, the chips in a row. */
const FilterLine: React.FC<{
  label: string;
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}> = ({ label, items, value, onChange }) => (
  <View className="flex-row items-center" style={{ gap: 6 }}>
    <Text style={{ width: 58, fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.4, color: COLORS.dim, textTransform: 'uppercase' }}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            accessibilityRole="tab"
            aria-selected={on}
            onPress={() => onChange(it.id)}
            className="active:opacity-75"
            style={{ height: 32, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center', backgroundColor: on ? COLORS.ctaFill : COLORS.surface2 }}
          >
            <Text style={{ fontFamily: FONT.cond800, fontSize: 12.5, color: on ? COLORS.ctaInk : COLORS.muted, textTransform: 'uppercase' }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);

export default Scout;
