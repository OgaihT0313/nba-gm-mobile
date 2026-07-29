import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SeasonState, Player } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamSalary, SALARY_CAP, getPlayerPositions, formatPositions, getTeamAccent, LINEUP_POSITIONS } from '../constants';
import { getFreeAgents, signFreeAgentLegality, newContractYears, evaluateSigningInterest } from '../services/freeAgencyService';
import { MIN_ROSTER_SIZE } from '../services/tradeService';
import StatCard from '../components/StatCard';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

interface FreeAgencyProps {
  season: SeasonState;
  onSign: (playerId: string) => void;
  onStartSeason: () => void;
}

const formatMoney = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
const POSITION_FILTERS = ['TODOS', 'PG', 'SG', 'SF', 'PF', 'C'];

// Sort keys the GM actually shops on. "Anos" is the length of the deal the
// player would sign (newContractYears) — a free agent's own contractYears is 0
// by definition, since expiring is what put them in the pool.
type SortKey = 'ovr' | 'salary' | 'years';
const SORTS: { key: SortKey; label: string; value: (p: Player) => number }[] = [
  { key: 'ovr', label: 'OVR', value: (p) => p.ovr },
  { key: 'salary', label: 'Salário', value: (p) => p.salary },
  { key: 'years', label: 'Anos', value: (p) => newContractYears(p) },
];

const FreeAgency: React.FC<FreeAgencyProps> = ({ season, onSign, onStartSeason }) => {
  const [posFilter, setPosFilter] = useState('TODOS');
  const [sortKey, setSortKey] = useState<SortKey>('ovr');
  const [sortAsc, setSortAsc] = useState(false);
  const { teams, players, userTeamId } = season;
  const userTeam = teams.find((t) => t.id === userTeamId);

  const freeAgents = useMemo(() => getFreeAgents(teams, players), [teams, players]);

  // Lineup slots with nobody to fill them — surfaced so the GM knows what to shop for.
  const holes = useMemo(() => {
    if (!userTeam) return [];
    const covered = new Set<string>();
    userTeam.roster.forEach((id) => {
      const p = players[id];
      if (p) getPlayerPositions(p).forEach((pos) => covered.add(pos));
    });
    return LINEUP_POSITIONS.filter((pos) => !covered.has(pos));
  }, [userTeam, players]);

  if (!userTeam) return null;

  const salary = getTeamSalary(userTeam, players);
  const capSpace = SALARY_CAP - salary;
  const accent = getTeamAccent(userTeam.id);
  const rosterCount = userTeam.roster.length;
  const belowMin = rosterCount < MIN_ROSTER_SIZE;
  const byPos = posFilter === 'TODOS' ? freeAgents : freeAgents.filter((p) => getPlayerPositions(p).includes(posFilter));
  const sortValue = SORTS.find((s) => s.key === sortKey)!.value;
  const filtered = [...byPos].sort((a, b) => (sortAsc ? sortValue(a) - sortValue(b) : sortValue(b) - sortValue(a)));

  // Clicking the active key flips direction; a new key starts descending
  // (best/most first, the common case).
  const onSortPress = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <Card variant="offseason" padding="lg" accentColor={accent.primary} className="gap-5">
          <PageHeader
            eyebrow="Offseason"
            title="Agência Livre"
            accentColor={accent.primary}
            subtitle={`Contratos expiraram pela liga. Reforce o ${userTeam.name} antes da nova temporada.`}
            actions={
              <Pressable
                onPress={belowMin ? undefined : onStartSeason}
                disabled={belowMin}
                className={`px-8 py-3 rounded-control items-center ${belowMin ? 'bg-slate-800' : 'bg-emerald-600'}`}
              >
                <Text className={`font-bold ${belowMin ? 'text-slate-600' : 'text-white'}`}>COMEÇAR TEMPORADA</Text>
              </Pressable>
            }
          />

          <View className="flex-row flex-wrap gap-2">
            <View className="flex-1 min-w-[45%]">
              <StatCard label="Cap Space" value={capSpace >= 0 ? formatMoney(capSpace) : `-${formatMoney(Math.abs(capSpace))}`} tone={capSpace >= 0 ? 'positive' : 'danger'} />
            </View>
            <View className="flex-1 min-w-[45%]">
              <StatCard label="Elenco" value={rosterCount} sub={`mín. ${MIN_ROSTER_SIZE}`} tone={belowMin ? 'danger' : 'default'} />
            </View>
            <View className="flex-1 min-w-[45%]">
              <StatCard label="Agentes Livres" value={freeAgents.length} tone="accent" />
            </View>
            <View className="flex-1 min-w-[45%]">
              <StatCard label="Lacunas" value={holes.length > 0 ? holes.join(' ') : '—'} tone="warning" />
            </View>
          </View>

          {belowMin ? (
            <Text className="text-xs font-bold text-red-400">
              Seu elenco tem menos de {MIN_ROSTER_SIZE} jogadores. Assine agentes livres para poder começar a temporada.
            </Text>
          ) : null}
        </Card>

        <View className="gap-3">
          <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Mercado</Text>
          <View className="flex-row flex-wrap gap-1">
            {POSITION_FILTERS.map((pos) => (
              <Pressable key={pos} onPress={() => setPosFilter(pos)} className={`px-2.5 py-1 rounded-full border ${posFilter === pos ? 'bg-accent border-accent' : 'bg-slate-900/50 border-slate-800'}`}>
                <Text className={`text-[9px] font-black uppercase tracking-widest ${posFilter === pos ? 'text-white' : 'text-slate-500'}`}>{pos}</Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-row items-center gap-1.5">
            <Text className="text-[9px] font-black uppercase tracking-widest text-slate-600 mr-0.5">Ordenar</Text>
            {SORTS.map((s) => {
              const active = sortKey === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => onSortPress(s.key)}
                  className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full border ${active ? 'bg-slate-800 border-slate-600' : 'bg-slate-900/50 border-slate-800'}`}
                >
                  <Text className={`text-[9px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-slate-500'}`}>{s.label}</Text>
                  {active ? <Text className="text-[8px] text-slate-400">{sortAsc ? '▲' : '▼'}</Text> : null}
                </Pressable>
              );
            })}
          </View>

          {filtered.map((player) => {
            const legality = signFreeAgentLegality(userTeam, player, players);
            const interest = evaluateSigningInterest(player, userTeam, teams, players);
            // Interest only blocks once cap/roster would otherwise allow it.
            const status = legality.legal && !interest.willing
              ? { legal: false, reason: interest.reason, unwilling: true }
              : { ...legality, unwilling: false };
            const fillsHole = holes.some((h) => getPlayerPositions(player).includes(h));
            return (
              <View key={player.id} className="flex-row items-center gap-3 p-3 mb-2 bg-slate-900 rounded-2xl border border-slate-800">
                <Image source={{ uri: getPlayerImageUrl(player) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b' }} contentFit="cover" />
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="font-bold text-sm text-white flex-shrink" numberOfLines={1}>{player.name}</Text>
                    {fillsHole ? <Text className="text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">Lacuna</Text> : null}
                    {status.unwilling ? <Text className="text-[8px] font-black uppercase bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Sem interesse</Text> : null}
                  </View>
                  <Text className="text-[10px] font-black text-sky-500 uppercase tracking-widest">
                    {formatPositions(player)} · {player.age}a · {formatMoney(player.salary)}/{newContractYears(player)}a
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xl font-black text-white">{player.ovr}</Text>
                  <Text className="text-[8px] font-bold text-slate-500 uppercase">OVR</Text>
                </View>
                <Pressable
                  onPress={status.legal ? () => onSign(player.id) : undefined}
                  disabled={!status.legal}
                  className={`px-4 py-2 rounded-xl ${status.legal ? 'bg-emerald-600' : 'bg-slate-800'}`}
                >
                  <Text className={`text-xs font-black uppercase tracking-wide ${status.legal ? 'text-white' : 'text-slate-600'}`}>Assinar</Text>
                </Pressable>
              </View>
            );
          })}
          {filtered.length === 0 ? <Text className="text-sm text-slate-600 italic">Nenhum agente livre nessa posição.</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
};

export default FreeAgency;
