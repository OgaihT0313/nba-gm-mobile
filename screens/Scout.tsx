import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Player, Team } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getPlayerPositions, formatPositions } from '../constants';
import PageHeader from '../components/PageHeader';
import PlayerDetailModal from '../components/PlayerDetailModal';
import Icon from '../components/Icon';
import ScoutAdvisor from '../components/ScoutAdvisor';

interface ScoutProps {
  players: { [key: string]: Player };
  teams: Team[];
  userTeamId: string;
}

const POSITION_FILTERS = ['TODOS', 'PG', 'SG', 'SF', 'PF', 'C'];
const AGE_FILTERS = ['TODOS', '<25', '25-30', '30+'] as const;
const OVR_FILTERS = ['TODOS', '90+', '80-89', '70-79', '<70'] as const;

const matchesAge = (age: number, f: typeof AGE_FILTERS[number]) =>
  f === '<25' ? age < 25 : f === '25-30' ? age >= 25 && age <= 30 : f === '30+' ? age > 30 : true;
const matchesOvr = (ovr: number, f: typeof OVR_FILTERS[number]) =>
  f === '90+' ? ovr >= 90 : f === '80-89' ? ovr >= 80 && ovr <= 89 : f === '70-79' ? ovr >= 70 && ovr <= 79 : f === '<70' ? ovr < 70 : true;

const Pill: React.FC<{ active: boolean; label: string; onPress: () => void }> = ({ active, label, onPress }) => (
  <Pressable onPress={onPress} className={`px-2.5 py-1 rounded-full border ${active ? 'bg-accent border-accent' : 'bg-slate-950/50 border-slate-800'}`}>
    <Text className={`text-[9px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-slate-500'}`}>{label}</Text>
  </Pressable>
);

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// Combining-diacritics range, written as escapes so the source stays ASCII.
const DIACRITICS = /[\u0300-\u036f]/g;

// Accent-insensitive so "jokic" finds "Jokić" — half the league's names carry
// diacritics the user won't type on a phone keyboard.
const normalize = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

const Scout: React.FC<ScoutProps> = ({ players, teams, userTeamId }) => {
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('TODOS');
  const [ageFilter, setAgeFilter] = useState<typeof AGE_FILTERS[number]>('TODOS');
  const [ovrFilter, setOvrFilter] = useState<typeof OVR_FILTERS[number]>('TODOS');
  const [selected, setSelected] = useState<Player | null>(null);

  const userTeam = teams.find((t) => t.id === userTeamId);

  const teamByPlayerId = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((t) => t.roster.forEach((pId) => map.set(pId, t)));
    return map;
  }, [teams]);

  // Retirees linger in the map for history only, and an undrafted prospect's
  // real rating is still under scouting fog — this screen would hand it over for
  // free. Both are excluded from the list AND from the headline count.
  const visible = (p: Player) => !p.retired && !p.prospect;

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
    <View className="px-4 pt-6 pb-3 gap-4">
      <PageHeader title="Scout" subtitle={`Filtre os ${activeCount} jogadores da liga.`} />
      {userTeam ? (
        <ScoutAdvisor userTeam={userTeam} teams={teams} players={players} onSelectPlayer={setSelected} />
      ) : null}
      <View className="bg-slate-900 rounded-card p-4 border border-slate-800 gap-3">
        <View className="flex-row items-center bg-slate-950/60 border border-slate-800 rounded-control px-3">
          <Icon name="scout" size={14} color="#64748b" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nome..."
            placeholderTextColor="#475569"
            autoCorrect={false}
            autoCapitalize="none"
            className="flex-1 text-sm text-white py-2.5 px-2"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text className="text-slate-500 text-base font-bold">×</Text>
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row flex-wrap gap-1.5">
          {POSITION_FILTERS.map((p) => <Pill key={p} active={posFilter === p} label={p} onPress={() => setPosFilter(p)} />)}
        </View>
        <View className="flex-row flex-wrap gap-1.5">
          {AGE_FILTERS.map((a) => <Pill key={a} active={ageFilter === a} label={a} onPress={() => setAgeFilter(a)} />)}
        </View>
        <View className="flex-row flex-wrap gap-1.5">
          {OVR_FILTERS.map((o) => <Pill key={o} active={ovrFilter === o} label={o} onPress={() => setOvrFilter(o)} />)}
        </View>
      </View>
      <Text className="text-xs font-bold text-slate-500">{results.length} jogador{results.length !== 1 ? 'es' : ''}</Text>
    </View>
  );

  return (
    <View className="flex-1">
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        initialNumToRender={12}
        windowSize={8}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(item)}
            className="flex-row items-center gap-3 p-3 mb-2 bg-slate-900 rounded-2xl border border-slate-800 active:border-slate-600"
          >
            <Image source={{ uri: getPlayerImageUrl(item) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
            <View className="flex-1 min-w-0">
              <Text className="font-bold text-sm text-white" numberOfLines={1}>{item.name}</Text>
              <Text className="text-[10px] font-black text-sky-500 uppercase tracking-widest">{formatPositions(item)} · {item.age} anos</Text>
            </View>
            <View className="items-end mr-1">
              <Text className="text-xl font-black text-white">{item.ovr}</Text>
              <Text className="text-[8px] font-bold text-slate-500 uppercase">OVR</Text>
            </View>
            {item.team ? (
              <Image source={{ uri: getTeamLogoUrl(item.team) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 20, height: 20 }} contentFit="contain" />
            ) : (
              <Text className="text-[8px] font-black uppercase text-slate-600">Livre</Text>
            )}
          </Pressable>
        )}
        ListEmptyComponent={<Text className="text-sm text-slate-600 italic px-4">Nenhum jogador encontrado.</Text>}
      />
      {selected ? <PlayerDetailModal player={selected} onClose={() => setSelected(null)} /> : null}
    </View>
  );
};

export default Scout;
