import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Player, Team } from '../types';
import {
  getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getPlayerPositions,
  formatPositions, attributeColor,
} from '../constants';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import { HeroBackdrop } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, HeroTitle, Stat, FilterRow } from '../components/ui/kit';
import PlayerDetailModal from '../components/PlayerDetailModal';
import Icon from '../components/Icon';
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
    <View style={{ paddingTop: insets.top + 6 }}>
      <View style={{ paddingHorizontal: 18 }}>
        <Eyebrow>Scout · {activeCount} jogadores</Eyebrow>
        <HeroTitle size={28} style={{ marginTop: 9 }}>Olho na liga</HeroTitle>
      </View>

      <View style={{ paddingHorizontal: 14, marginTop: 16, gap: 10 }}>
        {userTeam ? <ScoutAdvisor userTeam={userTeam} teams={teams} players={players} onSelectPlayer={setSelected} /> : null}

        <Panel padding={13}>
          <View
            className="flex-row items-center"
            style={{ backgroundColor: COLORS.sunken, borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.control, paddingHorizontal: 11 }}
          >
            <Icon name="scout" size={14} color={COLORS.navIdle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar por nome…"
              placeholderTextColor="#475569"
              autoCorrect={false}
              autoCapitalize="none"
              style={{ flex: 1, fontSize: 13, color: '#fff', paddingVertical: 9, paddingHorizontal: 8 }}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Text style={{ color: COLORS.navIdle, fontSize: 16, fontWeight: '700' }}>×</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ gap: 10, marginTop: 12 }}>
            <View style={{ gap: 6 }}>
              <MonoLabel size={8} color={INK.faint}>Posição</MonoLabel>
              <FilterRow items={POSITION_FILTERS} value={posFilter} onChange={setPosFilter} />
            </View>
            <View style={{ gap: 6 }}>
              <MonoLabel size={8} color={INK.faint}>Idade</MonoLabel>
              <FilterRow items={AGE_FILTERS} value={ageFilter} onChange={setAgeFilter} />
            </View>
            <View style={{ gap: 6 }}>
              <MonoLabel size={8} color={INK.faint}>Overall</MonoLabel>
              <FilterRow items={OVR_FILTERS} value={ovrFilter} onChange={setOvrFilter} />
            </View>
          </View>
        </Panel>

        <MonoLabel style={{ paddingLeft: 3 }}>
          {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
        </MonoLabel>
      </View>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <HeroBackdrop height={132 + insets.top} primary={accent.primary} secondary={accent.secondary} />

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 24 }}
        initialNumToRender={12}
        windowSize={8}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(item)}
            className="active:opacity-80"
            style={{ paddingHorizontal: 14, marginBottom: 8 }}
          >
            <Panel bar={attributeColor(item.ovr)} padding={11}>
              <View className="flex-row items-center" style={{ gap: 11 }}>
                <Image
                  source={{ uri: getPlayerImageUrl(item) }}
                  placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                  style={{ width: 38, height: 38, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text className="font-extrabold text-white" style={{ fontSize: 12.5 }} numberOfLines={1}>{item.name}</Text>
                  <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 2, letterSpacing: 0 }}>
                    {formatPositions(item)} · {item.age} anos
                  </MonoLabel>
                </View>
                <Stat size={19} color={attributeColor(item.ovr)}>{item.ovr}</Stat>
                {item.team ? (
                  <Image
                    source={{ uri: getTeamLogoUrl(item.team) }}
                    placeholder={{ uri: NBA_FALLBACK }}
                    style={{ width: 20, height: 20 }}
                    contentFit="contain"
                  />
                ) : (
                  // Wide enough for the whole word: matching the 20px team-logo
                  // slot broke "LIVRE" onto two lines ("LIV / RE") on device.
                  <MonoLabel
                    size={8}
                    color={COLORS.goodSoft}
                    numberOfLines={1}
                    style={{ width: 32, letterSpacing: 0, textAlign: 'right' }}
                  >
                    Livre
                  </MonoLabel>
                )}
              </View>
            </Panel>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ fontSize: 12, color: INK.faint, fontStyle: 'italic', paddingHorizontal: 18 }}>
            Nenhum jogador encontrado.
          </Text>
        }
      />

      {selected ? <PlayerDetailModal player={selected} onClose={() => setSelected(null)} /> : null}
    </View>
  );
};

export default Scout;
