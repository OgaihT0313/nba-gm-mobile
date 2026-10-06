import React, { useState } from 'react';
import { View, Text, Dimensions } from 'react-native';

import { PlayoffState, PlayoffSeries, PlayInBracket, Team } from '../types';
import { getTeamAccent } from '../constants';
import { COLORS, FONT, withAlpha } from '../src/theme/tokens';
import { SectionLabel } from './ui/kit';
import Trophy from './Trophy';

// Design 1d ("Transmissão"): a real converging bracket, laid out horizontally —
// the West enters from the left, the East from the right, the Finals sit in the
// middle. Geometry from the handoff, drawn on a 366x420 reference area and
// scaled to the measured width (x only; heights stay fixed):
//
//   columns (left x, box width 42; Finals 54 wide)
//     W R1 0 · W R2 54 · W R3 108 · Finals 156 · E R3 216 · E R2 270 · E R1 324
//   vertical centers
//     R1 52/157/262/367 · R2 105/315 · conf final and Finals 210
//
// Connectors are 1px staples (6px out, vertical, 6px in) in the conference's
// line color. Pairs feed in order — round1[0]+[1] → round2[0] and so on, the
// same pairing advanceOneRound in simulationService.ts uses — so the geometry
// mirrors the sim instead of guessing at it.

const REF_W = 366;
const AREA_H = 420;
const BOX_W = 42;
const FIN_W = 54;
const ROW_H = 20;
const TROPHY_H = 56;
const BOX_H = ROW_H * 2;

const COL_X = { wR1: 0, wR2: 54, wR3: 108, fin: 156, eR3: 216, eR2: 270, eR1: 324 } as const;
const Y_R1 = [52, 157, 262, 367];
const Y_R2 = [105, 315];
const Y_MID = 210;

// Seeds 1-6 keep their true regular-season rank; a play-in survivor is
// relabeled 7 or 8 per NBA convention once they reach Round 1.
const seedWithinConference = (conf: PlayoffState['east'], teamId: string): number => {
  const topSixIndex = conf.initialSeeds.slice(0, 6).findIndex((t) => t.id === teamId);
  if (topSixIndex !== -1) return topSixIndex + 1;
  if (conf.playIn?.sevenEight.w?.id === teamId) return 7;
  if (conf.playIn?.finalSeed.w?.id === teamId) return 8;
  const rawIndex = conf.initialSeeds.findIndex((t) => t.id === teamId);
  return rawIndex !== -1 ? rawIndex + 1 : -1;
};

/** Series wins, read positionally: `s` is always "m[0]wins-m[1]wins". */
export const seriesWins = (s: PlayoffSeries): [number, number] => {
  const parts = s.s ? s.s.split('-').map(Number) : [0, 0];
  return [parts[0] || 0, parts[1] || 0];
};

/** One series: two 20px rows — seed · tricode · wins. */
const Box: React.FC<{
  series: PlayoffSeries | undefined;
  left: number;
  centerY: number;
  width: number;
  color: string;
  seed: (teamId: string) => number | string;
  userTeamId?: string;
  live?: boolean;
}> = ({ series, left, centerY, width, color, seed, userTeamId, live }) => {
  const [a, b] = series?.m ?? [null, null];
  const [wa, wb] = series ? seriesWins(series) : [0, 0];
  const decided = !!series?.w;
  const mine = !!userTeamId && (a?.id === userTeamId || b?.id === userTeamId);
  const playing = !!(a && b) && !decided;
  const outline = live ? COLORS.bad : mine ? getTeamAccent(userTeamId!).primary : playing ? '#3A3A40' : COLORS.lineStrong;

  const Row: React.FC<{ team: Team | null; wins: number; top: boolean }> = ({ team, wins, top }) => {
    if (!team) {
      return (
        <View className="flex-row items-center justify-center" style={{ height: ROW_H, opacity: 0.45, borderTopWidth: top ? 0 : 1, borderTopColor: COLORS.line }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 11.5, color: COLORS.dim }}>—</Text>
        </View>
      );
    }
    const won = decided && series!.w!.id === team.id;
    const lost = decided && !won;
    const isUser = team.id === userTeamId;
    return (
      <View
        className="flex-row items-center"
        style={{
          height: ROW_H, paddingLeft: 2, paddingRight: 3, gap: 1.5, opacity: lost ? 0.38 : 1,
          backgroundColor: isUser ? withAlpha(getTeamAccent(team.id).primary, 0.32) : 'transparent',
          borderTopWidth: top ? 0 : 1, borderTopColor: COLORS.line,
        }}
      >
        <Text style={{ fontFamily: FONT.cond600, fontSize: 8.5, color: COLORS.dim, minWidth: 5 }}>{seed(team.id)}</Text>
        {/* Never ellipsized: a tricode is three letters, and "N…" names nobody. */}
        <Text style={{ flex: 1, fontFamily: FONT.cond800, fontSize: 11, letterSpacing: -0.2, color: COLORS.text }}>
          {team.id.toUpperCase()}
        </Text>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 12, color: won ? color : COLORS.textSoft, fontVariant: ['tabular-nums'] }}>
          {a && b ? wins : ''}
        </Text>
      </View>
    );
  };

  return (
    <View
      style={{
        position: 'absolute', left, top: centerY - BOX_H / 2, width, height: BOX_H,
        backgroundColor: COLORS.surface, borderRadius: 7, borderWidth: 1, borderColor: outline, overflow: 'hidden',
      }}
    >
      <Row team={a} wins={wa} top />
      <Row team={b} wins={wb} top={false} />
    </View>
  );
};

/** 1px staple from two source boxes (at y1, y2) into one target (at yT). */
const Staple: React.FC<{ fromX: number; dir: 1 | -1; y1: number; y2: number; yT: number; toX: number; color: string }> = ({
  fromX, dir, y1, y2, yT, toX, color,
}) => {
  const midX = fromX + dir * 6;
  const line = { position: 'absolute' as const, backgroundColor: color };
  const xMin = Math.min(fromX, midX);
  return (
    <>
      <View style={[line, { left: xMin, top: y1, width: 6, height: 1 }]} />
      <View style={[line, { left: xMin, top: y2, width: 6, height: 1 }]} />
      <View style={[line, { left: midX, top: Math.min(y1, y2), width: 1, height: Math.abs(y2 - y1) + 1 }]} />
      <View style={[line, { left: Math.min(midX, toX), top: yT, width: Math.abs(toX - midX), height: 1 }]} />
    </>
  );
};

const PlayInColumn: React.FC<{
  label: string;
  color: string;
  playIn: PlayInBracket;
  conf: PlayoffState['east'];
  userTeamId?: string;
  width: number;
}> = ({ label, color, playIn, conf, userTeamId, width }) => {
  const seed = (id: string) => {
    const i = conf.initialSeeds.findIndex((t) => t.id === id);
    return i !== -1 ? i + 1 : '?';
  };
  const boxW = width;
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <SectionLabel color={color}>{label}</SectionLabel>
      {[
        ['7 × 8', playIn.sevenEight],
        ['9 × 10', playIn.nineTen],
        ['Decisão', playIn.finalSeed],
      ].map(([title, s]) => (
        <View key={title as string} style={{ gap: 4 }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1, color: COLORS.dim, textTransform: 'uppercase' }}>{title as string}</Text>
          <View style={{ height: BOX_H }}>
            <Box series={s as PlayoffSeries} left={0} centerY={BOX_H / 2} width={boxW} color={color} seed={seed} userTeamId={userTeamId} />
          </View>
        </View>
      ))}
    </View>
  );
};

const PlayoffBracket: React.FC<{ playoffState: PlayoffState | null; userTeamId?: string }> = ({
  playoffState,
  userTeamId,
}) => {
  const [width, setWidth] = useState(() => Math.max(0, Math.min(REF_W, Dimensions.get('window').width - 24)));
  if (!playoffState) return null;

  const { east, west } = playoffState;
  const k = width / REF_W;
  const x = (v: number) => v * k;
  const bw = BOX_W * k;
  const fw = FIN_W * k;
  const pending = playoffState.pendingDecider;
  const isLive = (conf: 'east' | 'west', round: 'round1' | 'round2' | 'round3', index: number) =>
    pending?.scope === 'conference' && pending.conf === conf && pending.round === round && pending.index === index;

  const seedOf = (conf: PlayoffState['east']) => (id: string) => {
    const s = seedWithinConference(conf, id);
    return s !== -1 ? s : '';
  };
  const finalsSeed = (id: string) => {
    const e = seedWithinConference(east, id);
    if (e !== -1) return e;
    const w = seedWithinConference(west, id);
    return w !== -1 ? w : '';
  };

  // Before Round 1 exists the play-in is the whole story: same boxes, its own
  // simple layout.
  if (east.bracket.round1.length === 0 && west.bracket.round1.length === 0) {
    if (!east.playIn && !west.playIn) return null;
    const colW = (width - 12) / 2;
    return (
      <View style={{ gap: 10 }} onLayout={(e) => {
        const w = Math.min(REF_W, e.nativeEvent.layout.width);
        if (w > 0 && Math.round(w) !== Math.round(width)) setWidth(w);
      }}>
        <View className="flex-row" style={{ gap: 12 }}>
          {west.playIn ? <PlayInColumn label="Oeste · Play-in" color={COLORS.west} playIn={west.playIn} conf={west} userTeamId={userTeamId} width={colW} /> : null}
          {east.playIn ? <PlayInColumn label="Leste · Play-in" color={COLORS.east} playIn={east.playIn} conf={east} userTeamId={userTeamId} width={colW} /> : null}
        </View>
      </View>
    );
  }

  const LABELS: [number, number, string][] = [
    [COL_X.wR1, BOX_W, '1ª rod.'], [COL_X.wR2, BOX_W, 'Semi'], [COL_X.wR3, BOX_W, 'Final'],
    [COL_X.fin, FIN_W, 'NBA'],
    [COL_X.eR3, BOX_W, 'Final'], [COL_X.eR2, BOX_W, 'Semi'], [COL_X.eR1, BOX_W, '1ª rod.'],
  ];

  return (
    <View
      style={{ gap: 8, alignItems: 'center' }}
      onLayout={(e) => {
        const w = Math.min(REF_W, e.nativeEvent.layout.width);
        if (w > 0 && Math.round(w) !== Math.round(width)) setWidth(w);
      }}
    >
      {/* Conference bands. */}
      <View className="flex-row" style={{ width, gap: 4 }}>
        <View style={{ flex: 3, height: 26, borderRadius: 6, backgroundColor: COLORS.west, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 13, letterSpacing: 1.6, color: '#fff' }}>OESTE</Text>
        </View>
        <View style={{ flex: 1.3, height: 26, borderRadius: 6, borderWidth: 1, borderColor: withAlpha(COLORS.gold, 0.6), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 12, letterSpacing: 1.4, color: COLORS.gold }}>FINAIS</Text>
        </View>
        <View style={{ flex: 3, height: 26, borderRadius: 6, backgroundColor: COLORS.east, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 13, letterSpacing: 1.6, color: '#fff' }}>LESTE</Text>
        </View>
      </View>

      {/* Round labels, one per column. */}
      <View style={{ width, height: 14 }}>
        {LABELS.map(([lx, lw, text], i) => (
          <Text
            key={i}
            numberOfLines={1}
            style={{
              position: 'absolute', left: x(lx), width: lw * k, textAlign: 'center',
              fontFamily: FONT.cond700, fontSize: 9.5, letterSpacing: 0.6, color: i === 3 ? COLORS.gold : COLORS.dim, textTransform: 'uppercase',
            }}
          >
            {text}
          </Text>
        ))}
      </View>

      <View style={{ width, height: AREA_H + 20 }}>
        {/* West connectors: R1 → R2 → R3 → Finals. */}
        {[0, 1].map((p) => (
          <Staple key={`w12${p}`} fromX={x(COL_X.wR1) + bw} dir={1} y1={Y_R1[p * 2]} y2={Y_R1[p * 2 + 1]} yT={Y_R2[p]} toX={x(COL_X.wR2)} color={COLORS.westLine} />
        ))}
        <Staple fromX={x(COL_X.wR2) + bw} dir={1} y1={Y_R2[0]} y2={Y_R2[1]} yT={Y_MID} toX={x(COL_X.wR3)} color={COLORS.westLine} />
        <View style={{ position: 'absolute', left: x(COL_X.wR3) + bw, top: Y_MID, width: x(COL_X.fin) - x(COL_X.wR3) - bw, height: 1, backgroundColor: COLORS.westLine }} />
        {/* East connectors, mirrored. */}
        {[0, 1].map((p) => (
          <Staple key={`e12${p}`} fromX={x(COL_X.eR1)} dir={-1} y1={Y_R1[p * 2]} y2={Y_R1[p * 2 + 1]} yT={Y_R2[p]} toX={x(COL_X.eR2) + bw} color={COLORS.eastLine} />
        ))}
        <Staple fromX={x(COL_X.eR2)} dir={-1} y1={Y_R2[0]} y2={Y_R2[1]} yT={Y_MID} toX={x(COL_X.eR3) + bw} color={COLORS.eastLine} />
        <View style={{ position: 'absolute', left: x(COL_X.fin) + fw, top: Y_MID, width: x(COL_X.eR3) - x(COL_X.fin) - fw, height: 1, backgroundColor: COLORS.eastLine }} />

        {/* West boxes. */}
        {Y_R1.map((cy, i) => (
          <Box key={`wr1${i}`} series={west.bracket.round1[i]} left={x(COL_X.wR1)} centerY={cy} width={bw} color={COLORS.west} seed={seedOf(west)} userTeamId={userTeamId} live={isLive('west', 'round1', i)} />
        ))}
        {Y_R2.map((cy, i) => (
          <Box key={`wr2${i}`} series={west.bracket.round2[i]} left={x(COL_X.wR2)} centerY={cy} width={bw} color={COLORS.west} seed={seedOf(west)} userTeamId={userTeamId} live={isLive('west', 'round2', i)} />
        ))}
        <Box series={west.bracket.round3[0]} left={x(COL_X.wR3)} centerY={Y_MID} width={bw} color={COLORS.west} seed={seedOf(west)} userTeamId={userTeamId} live={isLive('west', 'round3', 0)} />

        {/* East boxes. */}
        {Y_R1.map((cy, i) => (
          <Box key={`er1${i}`} series={east.bracket.round1[i]} left={x(COL_X.eR1)} centerY={cy} width={bw} color={COLORS.east} seed={seedOf(east)} userTeamId={userTeamId} live={isLive('east', 'round1', i)} />
        ))}
        {Y_R2.map((cy, i) => (
          <Box key={`er2${i}`} series={east.bracket.round2[i]} left={x(COL_X.eR2)} centerY={cy} width={bw} color={COLORS.east} seed={seedOf(east)} userTeamId={userTeamId} live={isLive('east', 'round2', i)} />
        ))}
        <Box series={east.bracket.round3[0]} left={x(COL_X.eR3)} centerY={Y_MID} width={bw} color={COLORS.east} seed={seedOf(east)} userTeamId={userTeamId} live={isLive('east', 'round3', 0)} />

        {/* The Finals, under the trophy. */}
        <View style={{ position: 'absolute', left: x(COL_X.fin) + fw / 2 - TROPHY_H * 20 / 64, top: Y_MID - BOX_H / 2 - TROPHY_H - 8 }}>
          <Trophy size={TROPHY_H} />
        </View>
        <Box
          series={playoffState.finals ?? undefined}
          left={x(COL_X.fin)}
          centerY={Y_MID}
          width={fw}
          color={COLORS.gold}
          seed={finalsSeed}
          userTeamId={userTeamId}
          live={pending?.scope === 'finals'}
        />
        {playoffState.champion ? (
          <Text
            numberOfLines={1}
            style={{
              position: 'absolute', left: x(COL_X.fin) - 20, width: fw + 40, top: Y_MID + BOX_H / 2 + 6, textAlign: 'center',
              fontFamily: FONT.cond800, fontSize: 11, letterSpacing: 1, color: COLORS.gold,
            }}
          >
            {playoffState.champion.id.toUpperCase()} CAMPEÃO
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export default PlayoffBracket;
