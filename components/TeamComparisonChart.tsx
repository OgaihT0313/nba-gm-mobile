import React from 'react';
import { View, Text } from 'react-native';
import { Team, Player } from '../types';
import { getTeamAccent, getPlayerPositions } from '../constants';

// RN port. This was already CSS bars on the web (rewritten from a Chart.js
// radar that rendered broken when no rival was picked), so it ports to plain
// Views — no chart library needed.
interface TeamComparisonChartProps {
  team1: Team | null;
  team2: Team | null;
  players: { [key: string]: Player };
}

interface TeamRatings {
  attack: number;
  defense: number;
  perimeter: number;
  paint: number;
  depth: number;
}

const CATEGORIES: { key: keyof TeamRatings; label: string }[] = [
  { key: 'attack', label: 'Ataque' },
  { key: 'defense', label: 'Defesa' },
  { key: 'perimeter', label: 'Perímetro' },
  { key: 'paint', label: 'Garrafão' },
  { key: 'depth', label: 'Profundidade' },
];

// Same 60-100 window the old radar used, so a small real gap still reads as a
// clearly different bar length.
const BAR_MIN = 60;
const BAR_MAX = 100;
const scaleToPct = (value: number) => Math.max(4, Math.min(100, ((value - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));

const calculateTeamRatings = (team: Team, players: { [key: string]: Player }): TeamRatings => {
  const rosterPlayers = team.roster.map((pId) => players[pId]).filter(Boolean);
  const top8 = [...rosterPlayers].sort((a, b) => b.ovr - a.ovr).slice(0, 8);
  if (top8.length === 0) return { attack: 0, defense: 0, perimeter: 0, paint: 0, depth: 0 };

  const attack = top8.reduce((acc, p) => acc + p.off, 0) / top8.length;
  const defense = top8.reduce((acc, p) => acc + p.def, 0) / top8.length;
  // Split on the real positions now that the data has them: guards + wings are
  // the perimeter, the two bigs are the paint. A combo player counts on both
  // sides, which is the honest read of what they give a team.
  const isPerimeter = (p: Player) => getPlayerPositions(p).some((pos) => ['PG', 'SG', 'SF'].includes(pos));
  const isPaint = (p: Player) => getPlayerPositions(p).some((pos) => ['PF', 'C'].includes(pos));
  const perimeterPlayers = top8.filter(isPerimeter);
  const perimeter = perimeterPlayers.length ? perimeterPlayers.reduce((acc, p) => acc + p.ovr, 0) / perimeterPlayers.length : 70;
  const paintPlayers = top8.filter(isPaint);
  const paint = paintPlayers.length ? paintPlayers.reduce((acc, p) => acc + p.ovr, 0) / paintPlayers.length : 70;
  const bench = rosterPlayers.slice(5, 10);
  const depth = bench.length ? bench.reduce((acc, p) => acc + p.ovr, 0) / bench.length : 65;

  return { attack, defense, perimeter, paint, depth };
};

const TeamComparisonChart: React.FC<TeamComparisonChartProps> = ({ team1, team2, players }) => {
  if (!team1 || !team2) {
    return (
      <View className="w-full bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60">
        <View className="h-32 items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl px-6">
          <Text className="text-slate-600 font-bold uppercase tracking-widest text-xs text-center">
            Selecione um rival para comparar os elencos
          </Text>
        </View>
      </View>
    );
  }

  const accent1 = getTeamAccent(team1.id);
  const accent2 = getTeamAccent(team2.id);
  const r1 = calculateTeamRatings(team1, players);
  const r2 = calculateTeamRatings(team2, players);

  return (
    <View className="w-full bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60 gap-5">
      <View className="flex-row items-center justify-center gap-5 flex-wrap">
        <View className="flex-row items-center gap-2">
          <View className="w-3 h-3 rounded-full" style={{ backgroundColor: accent1.primary }} />
          <Text className="text-xs font-bold text-white" numberOfLines={1}>{team1.name}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="w-3 h-3 rounded-full" style={{ backgroundColor: accent2.primary }} />
          <Text className="text-xs font-bold text-white" numberOfLines={1}>{team2.name}</Text>
        </View>
      </View>

      <View className="gap-4">
        {CATEGORIES.map((cat) => {
          const v1 = r1[cat.key];
          const v2 = r2[cat.key];
          return (
            <View key={cat.key}>
              <Text className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">{cat.label}</Text>
              <View className="flex-row items-center gap-2">
                {/* left side grows right-to-left */}
                <View className="flex-1 flex-row items-center justify-end gap-2">
                  <Text className="text-xs font-black" style={{ color: accent1.primary }}>{Math.round(v1)}</Text>
                  <View className="h-2 rounded-full" style={{ width: `${scaleToPct(v1)}%`, backgroundColor: accent1.primary }} />
                </View>
                <View className="w-px h-6 bg-slate-800" />
                <View className="flex-1 flex-row items-center justify-start gap-2">
                  <View className="h-2 rounded-full" style={{ width: `${scaleToPct(v2)}%`, backgroundColor: accent2.primary }} />
                  <Text className="text-xs font-black" style={{ color: accent2.primary }}>{Math.round(v2)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default TeamComparisonChart;
