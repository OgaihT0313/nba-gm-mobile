import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Svg, Rect, Path, Circle, Line } from 'react-native-svg';
import { Team, Player } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getPlayerPositions, POSITIONS } from '../constants';
import { simulationEngine, LineupSlot } from '../services/simulationService';
import { useTheme } from '../src/theme/ThemeProvider';

interface StartersCourtProps {
  team: Team;
  players: { [key: string]: Player };
  onSetStarter: (pos: string, playerId: string) => void;
}

// Same percentage placement as the web over a half-court diagram. RN can't do
// `translate(-50%)`, so slots are offset by half their known size instead.
// `pos` here is the slot id (matches LineupSlot.pos from getLineup/
// simulationService.ts), which since the fine-grained taxonomy is also the
// label shown to the user. Placement follows a real halfcourt set: the point
// guard up top, the shooting guard and small forward on the wings, the power
// forward on the weak-side block and the center in the paint.
const SLOT = 56;
const SLOT_LAYOUT: { pos: string; top: string; left: string }[] = [
  { pos: 'PG', top: '8%', left: '50%' },
  { pos: 'SG', top: '34%', left: '84%' },
  { pos: 'SF', top: '34%', left: '16%' },
  { pos: 'PF', top: '68%', left: '26%' },
  { pos: 'C', top: '84%', left: '50%' },
];

const substituteReason = (team: Team, slot: LineupSlot): string => {
  if (!slot.designatedId) return '';
  if (!team.roster.includes(slot.designatedId)) return 'não está mais no elenco';
  const absence = team.playerAbsences?.[slot.designatedId];
  if (absence) return absence.reason === 'injury' ? 'lesionado' : 'suspenso';
  return 'em queda de forma';
};

const StartersCourt: React.FC<StartersCourtProps> = ({ team, players, onSetStarter }) => {
  const [activePos, setActivePos] = useState<string | null>(null);
  const { accent } = useTheme();

  const { slots } = simulationEngine.getLineup(team, players);
  const slotByPos = new Map(slots.map((s) => [s.pos, s]));
  const substitutes = slots.filter((s) => s.isSubstitute && s.designatedId);
  const activeBucket = activePos ? slotByPos.get(activePos)?.bucket : undefined;

  const candidatesFor = (bucket: string) =>
    team.roster
      .map((pId) => players[pId])
      .filter((p): p is Player => !!p && getPlayerPositions(p).includes(bucket))
      .sort((a, b) => b.ovr - a.ovr);

  return (
    <View className="bg-panel rounded-card border border-line p-5 gap-5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-lg font-bold text-white">Titulares</Text>
        <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Toque pra trocar</Text>
      </View>

      <View className="w-full" style={{ aspectRatio: 4 / 3 }}>
        <Svg viewBox="0 0 400 320" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <Rect x="10" y="10" width="380" height="300" rx="4" fill="none" stroke="#24344f" strokeWidth="2" />
          <Rect x="120" y="190" width="160" height="120" fill="none" stroke="#24344f" strokeWidth="2" />
          <Path d="M 140 190 A 60 60 0 0 0 260 190" fill="none" stroke="#24344f" strokeWidth="2" />
          <Path d="M 40 310 C 40 140, 360 140, 360 310" fill="none" stroke="#24344f" strokeWidth="2" />
          <Circle cx="200" cy="300" r="7" fill="none" stroke="#24344f" strokeWidth="2" />
          <Line x1="168" y1="290" x2="232" y2="290" stroke="#24344f" strokeWidth="2" />
        </Svg>

        {SLOT_LAYOUT.map(({ pos, top, left }) => {
          const slot = slotByPos.get(pos);
          const player = slot?.playerId ? players[slot.playerId] : null;
          const isActive = activePos === pos;
          return (
            <Pressable
              key={pos}
              onPress={() => setActivePos(isActive ? null : pos)}
              style={{ position: 'absolute', top: top as any, left: left as any, marginLeft: -SLOT / 2, marginTop: -SLOT / 2, alignItems: 'center' }}
            >
              <View
                className="rounded-full overflow-hidden bg-ink"
                style={{
                  width: SLOT,
                  height: SLOT,
                  borderWidth: isActive ? 3 : 2,
                  borderColor: slot?.isSubstitute ? '#f59e0b' : accent.primary,
                }}
              >
                {player ? (
                  <Image source={{ uri: getPlayerImageUrl(player) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <View className="w-full h-full items-center justify-center">
                    <Text className="text-slate-500 text-[10px] font-black">?</Text>
                  </View>
                )}
              </View>
              <View className="bg-ink border border-line rounded-full px-1.5" style={{ marginTop: -8 }}>
                <Text className="text-[9px] font-black text-white">{player ? player.ovr : '-'}</Text>
              </View>
              <Text className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">{slot?.bucket ?? ''}</Text>
            </Pressable>
          );
        })}
      </View>

      {substitutes.length > 0 ? (
        <View className="gap-1 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3">
          {substitutes.map((s) => (
            <Text key={s.pos} className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">
              {s.bucket}: {players[s.designatedId!]?.name} {substituteReason(team, s)} — {players[s.playerId!]?.name} entra no lugar
            </Text>
          ))}
        </View>
      ) : null}

      {activePos ? (
        <View className="bg-sunken rounded-2xl border border-line p-4 gap-2">
          <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Escolher titular — {(activeBucket && POSITIONS[activeBucket]) || activeBucket}
          </Text>
          {candidatesFor(activeBucket || '').map((p) => {
            const isDesignated = team.starters?.[activePos] === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => { onSetStarter(activePos, p.id); setActivePos(null); }}
                className={`flex-row items-center justify-between gap-3 p-2 rounded-xl border ${isDesignated ? '' : 'bg-panel border-line'}`}
                style={isDesignated ? { backgroundColor: `${accent.primary}33`, borderColor: accent.primary } : undefined}
              >
                <View className="flex-row items-center gap-2 flex-1 min-w-0">
                  <Image source={{ uri: getPlayerImageUrl(p) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e293b' }} contentFit="cover" />
                  <Text className="font-bold text-xs text-white flex-1" numberOfLines={1}>{p.name}</Text>
                </View>
                <Text className="font-mono-bold text-xs text-accent">{p.ovr}</Text>
              </Pressable>
            );
          })}
          {candidatesFor(activeBucket || '').length === 0 ? (
            <Text className="text-slate-500 text-xs italic">Nenhum jogador desse elenco joga nessa posição.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export default StartersCourt;
