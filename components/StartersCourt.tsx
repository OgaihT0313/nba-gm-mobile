import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Svg, Rect, Path, Circle, Line, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { Team, Player } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getPlayerPositions, POSITIONS } from '../constants';
import { simulationEngine, LineupSlot } from '../services/simulationService';
import { useTheme } from '../src/theme/ThemeProvider';
import { FONT } from '../src/theme/tokens';
import { useDesktop } from './desktop/useDesktop';

interface StartersCourtProps {
  team: Team;
  players: { [key: string]: Player };
  // Absent = read-only: another franchise's five, looked at but not run.
  // Tapping a player then opens him (onPlayerPress) instead of the picker.
  onSetStarter?: (pos: string, playerId: string) => void;
  onPlayerPress?: (player: Player) => void;
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
  { pos: 'PF', top: '64%', left: '26%' },
  { pos: 'C', top: '79%', left: '50%' },
];

// --- The half court, drawn to scale ----------------------------------------
// 6.6 px per foot in a 400 x 320 box: the 50 ft width spans 330 px between
// light-wood aprons, the 47 ft half runs from the baseline (bottom) to the
// half-court line (top). Every mark is at its NBA measurement, so it reads
// as a court and not as a sketch of one.
const FT = 6.6;
const CX = 200;
const BASE_Y = 315;                     // baseline
const COURT_L = CX - 25 * FT;           // sidelines
const COURT_R = CX + 25 * FT;
const MID_Y = BASE_Y - 47 * FT;         // half-court line
const RIM_Y = BASE_Y - 5.25 * FT;       // rim center
const BOARD_Y = BASE_Y - 4 * FT;        // backboard face
const LANE_HALF = 8 * FT;               // 16 ft lane
const FT_Y = BASE_Y - 19 * FT;          // free-throw line
const FT_R = 6 * FT;                    // free-throw circle
const RA_R = 4 * FT;                    // restricted area
const THREE_R = 23.75 * FT;             // three-point arc
const CORNER_X = 22 * FT;               // straight corner three
const CORNER_TOP = RIM_Y - Math.sqrt(THREE_R ** 2 - CORNER_X ** 2);

// Board strips, lengthwise like a real floor; deterministic so the floor
// doesn't reshuffle on every render.
const PLANK = 9;
const PLANKS = Array.from({ length: Math.ceil(400 / PLANK) }, (_, i) => {
  const t = Math.sin(i * 12.9898) * 43758.5453;
  const r = t - Math.floor(t);
  return { x: i * PLANK, opacity: 0.04 + r * 0.1, dark: r > 0.5 };
});

const LINE = '#ffffff';
const LW = 2.2;

const CourtDiagram: React.FC<{ paint: string }> = ({ paint }) => (
  <Svg viewBox="0 0 400 320" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
    <Defs>
      <LinearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#d9a35f" />
        <Stop offset="1" stopColor="#c98f4c" />
      </LinearGradient>
      <LinearGradient id="apron" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#ecd6b0" />
        <Stop offset="1" stopColor="#e2c79c" />
      </LinearGradient>
      <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
        <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.12" />
        <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </LinearGradient>
    </Defs>

    {/* Floor: light apron outside the lines, warmer maple inside. */}
    <Rect x="0" y="0" width="400" height="320" fill="url(#apron)" />
    <Rect x={COURT_L} y={MID_Y} width={COURT_R - COURT_L} height={BASE_Y - MID_Y} fill="url(#wood)" />
    {PLANKS.map((pl) => (
      <Rect key={pl.x} x={pl.x} y="0" width={PLANK - 0.6} height="320" fill={pl.dark ? '#5a3410' : '#ffffff'} opacity={pl.opacity} />
    ))}
    <Rect x="0" y="0" width="400" height="320" fill="url(#sheen)" />

    {/* Painted lane in the team color. */}
    <Rect x={CX - LANE_HALF} y={FT_Y} width={LANE_HALF * 2} height={BASE_Y - FT_Y} fill={paint} opacity={0.82} />

    <G fill="none" stroke={LINE} strokeWidth={LW}>
      {/* Boundary and half-court line, with the bottom of the center circle. */}
      <Rect x={COURT_L} y={MID_Y} width={COURT_R - COURT_L} height={BASE_Y - MID_Y} />
      <Path d={`M ${CX - FT_R} ${MID_Y} A ${FT_R} ${FT_R} 0 0 0 ${CX + FT_R} ${MID_Y}`} />
      <Path d={`M ${CX - 2 * FT} ${MID_Y} A ${2 * FT} ${2 * FT} 0 0 0 ${CX + 2 * FT} ${MID_Y}`} />

      {/* Three-point line: straight corners, then the arc. */}
      <Path d={`M ${CX - CORNER_X} ${BASE_Y} L ${CX - CORNER_X} ${CORNER_TOP} A ${THREE_R} ${THREE_R} 0 0 1 ${CX + CORNER_X} ${CORNER_TOP} L ${CX + CORNER_X} ${BASE_Y}`} />

      {/* Lane, free-throw line and circle (solid outside, dashed inside). */}
      <Rect x={CX - LANE_HALF} y={FT_Y} width={LANE_HALF * 2} height={BASE_Y - FT_Y} />
      <Path d={`M ${CX - FT_R} ${FT_Y} A ${FT_R} ${FT_R} 0 0 1 ${CX + FT_R} ${FT_Y}`} />
      <Path d={`M ${CX - FT_R} ${FT_Y} A ${FT_R} ${FT_R} 0 0 0 ${CX + FT_R} ${FT_Y}`} strokeDasharray="6 5" />

      {/* Lane hash marks and the block. */}
      {[7, 11, 14, 17].map((d) => (
        <G key={d}>
          <Line x1={CX - LANE_HALF} y1={BASE_Y - d * FT} x2={CX - LANE_HALF - 5} y2={BASE_Y - d * FT} />
          <Line x1={CX + LANE_HALF} y1={BASE_Y - d * FT} x2={CX + LANE_HALF + 5} y2={BASE_Y - d * FT} />
        </G>
      ))}

      {/* Coach's box ticks on the sidelines, 28 ft from the baseline. */}
      <Line x1={COURT_L} y1={BASE_Y - 28 * FT} x2={COURT_L - 8} y2={BASE_Y - 28 * FT} />
      <Line x1={COURT_R} y1={BASE_Y - 28 * FT} x2={COURT_R + 8} y2={BASE_Y - 28 * FT} />

      {/* Restricted area, backboard and rim. */}
      <Path d={`M ${CX - RA_R} ${BOARD_Y} L ${CX - RA_R} ${RIM_Y} A ${RA_R} ${RA_R} 0 0 1 ${CX + RA_R} ${RIM_Y} L ${CX + RA_R} ${BOARD_Y}`} />
    </G>
    <Line x1={CX - 3 * FT} y1={BOARD_Y} x2={CX + 3 * FT} y2={BOARD_Y} stroke={LINE} strokeWidth={3.2} />
    <Line x1={CX} y1={BOARD_Y} x2={CX} y2={RIM_Y + 0.75 * FT} stroke={LINE} strokeWidth={1.6} />
    <Circle cx={CX} cy={RIM_Y} r={0.75 * FT} fill="none" stroke="#e8762b" strokeWidth={2.2} />
  </Svg>
);

// "Jaren Jackson Jr." reads as Jackson, not Jr.
const surname = (name: string) => {
  const parts = name.split(' ').filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(w));
  return parts[parts.length - 1] ?? name;
};

const substituteReason = (team: Team, slot: LineupSlot): string => {
  if (!slot.designatedId) return '';
  if (!team.roster.includes(slot.designatedId)) return 'não está mais no elenco';
  const absence = team.playerAbsences?.[slot.designatedId];
  if (absence) return absence.reason === 'injury' ? 'lesionado' : 'suspenso';
  return 'em queda de forma';
};

const StartersCourt: React.FC<StartersCourtProps> = ({ team, players, onSetStarter, onPlayerPress }) => {
  const editable = !!onSetStarter;
  const [activePos, setActivePos] = useState<string | null>(null);
  const { accent } = useTheme();
  // PC: the court is ~3× wider, so the slots grow from 56 to 72px.
  const desktop = useDesktop();
  const S = desktop ? 72 : SLOT;

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
        <Text className="text-lg font-bold text-white">{editable ? 'Titulares' : 'Quinteto titular'}</Text>
        <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {editable ? 'Toque pra trocar' : 'Toque pra ver o jogador'}
        </Text>
      </View>

      <View className="w-full" style={{ aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' }}>
        <CourtDiagram paint={accent.primary} />

        {SLOT_LAYOUT.map(({ pos, top, left }) => {
          const slot = slotByPos.get(pos);
          const player = slot?.playerId ? players[slot.playerId] : null;
          const isActive = activePos === pos;
          return (
            <Pressable accessibilityRole="button"
              key={pos}
              onPress={() => (editable ? setActivePos(isActive ? null : pos) : player && onPlayerPress?.(player))}
              style={{ position: 'absolute', top: top as any, left: left as any, marginLeft: -S / 2, marginTop: -S / 2, alignItems: 'center' }}
            >
              <View
                className="rounded-full overflow-hidden bg-ink"
                style={{
                  width: S,
                  height: S,
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
                <Text className="font-black text-white" style={{ fontSize: desktop ? 12 : 9 }}>{player ? player.ovr : '-'}</Text>
              </View>
              <View style={{ marginTop: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(11,11,13,0.82)', alignItems: 'center' }}>
                <Text style={{ fontFamily: FONT.cond700, fontSize: desktop ? 10 : 9, letterSpacing: 1, color: '#C9C6C0' }}>{slot?.bucket ?? ''}</Text>
                {player ? (
                  <Text style={{ fontFamily: FONT.cond700, fontSize: desktop ? 13 : 11.5, lineHeight: desktop ? 14 : 13, color: '#F3F1EC', maxWidth: desktop ? 120 : 92 }} numberOfLines={1}>
                    {surname(player.name)}
                  </Text>
                ) : null}
              </View>
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

      {editable && activePos ? (
        <View className="bg-sunken rounded-2xl border border-line p-4 gap-2">
          <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Escolher titular — {(activeBucket && POSITIONS[activeBucket]) || activeBucket}
          </Text>
          {candidatesFor(activeBucket || '').map((p) => {
            const isDesignated = team.starters?.[activePos] === p.id;
            return (
              <Pressable accessibilityRole="button"
                key={p.id}
                onPress={() => { onSetStarter?.(activePos, p.id); setActivePos(null); }}
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
