import React, { useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { Image } from 'expo-image';

import { PlayoffState, PlayoffSeries, PlayInBracket, Team } from '../types';
import { getTeamLogoUrl, getTeamNickname, getTeamTricode } from '../constants';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import { MonoLabel, Stat, SectionLabel } from './ui/kit';

// Design 3d. A real chaveamento, drawn vertically instead of the usual
// left-to-right tree — the shape a bracket has to have to fit a 390px screen
// with no horizontal scroll. Every round is still its own row (4 series, then
// 2, then 1), each row exactly as wide as the ones above it, connected by a
// simple two-in-one-out staple: two verticals meeting a bar, one stem feeding
// the box below. The math that keeps the boxes aligned under their own
// source pair is in RoundTree below — it only works because every "next"
// round is built from consecutive pairs (round1[0]+[1] → round2[0], etc, see
// advanceOneRound in simulationService.ts), so the geometry mirrors the sim's
// own pairing instead of guessing at it.

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const ROUND_LABEL: Record<string, string> = {
  playin: 'Play-in',
  round1: 'Primeira rodada',
  round2: 'Semifinais de conferência',
  round3: 'Final de conferência',
  finals: 'Finais da NBA',
};

const ROW_GAP = 8;
const CONNECTOR_H = 16;
const STROKE = 2;

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

/**
 * The staple-shaped connector between a pair of boxes and the single box they
 * feed: two short verticals down from the pair's bottom edge, a horizontal
 * bar joining them, one stem down the middle into the next box. Built from
 * plain Views (not SVG) so the geometry is exact pixel math against the same
 * `width` the boxes above/below it were laid out with — no viewBox scaling to
 * fight with.
 */
const Connector: React.FC<{ width: number }> = ({ width }) => {
  if (width <= 0) return <View style={{ height: CONNECTOR_H }} />;
  const boxW = (width - ROW_GAP) / 2;
  const leftX = boxW / 2;
  const rightX = boxW + ROW_GAP + boxW / 2;
  const centerX = width / 2;
  const midY = CONNECTOR_H / 2;
  const bar = { backgroundColor: COLORS.line } as const;
  return (
    <View style={{ width, height: CONNECTOR_H }}>
      <View style={[{ position: 'absolute', left: leftX - STROKE / 2, top: 0, width: STROKE, height: midY }, bar]} />
      <View style={[{ position: 'absolute', left: rightX - STROKE / 2, top: 0, width: STROKE, height: midY }, bar]} />
      <View style={[{ position: 'absolute', left: leftX, top: midY - STROKE / 2, width: rightX - leftX, height: STROKE }, bar]} />
      <View style={[{ position: 'absolute', left: centerX - STROKE / 2, top: midY, width: STROKE, height: CONNECTOR_H - midY }, bar]} />
    </View>
  );
};

/** One series as a bracket box. Density scales with `width`: round1's 4-across
 * row gets tricodes and no logo, everything wider gets a small crest, and the
 * single full-width box (conf finals / finals / the play-in decider) gets the
 * full nickname and an "avança" line once it's decided. */
const BracketNode: React.FC<{
  series: PlayoffSeries;
  seeds: (teamId?: string) => number | string;
  userTeamId?: string;
  width: number;
  /** Set when this exact series is the paused Game 7 the user plays live. */
  decider?: boolean;
}> = ({ series, seeds, userTeamId, width, decider }) => {
  const { accent } = useTheme();
  const [a, b] = series.m;
  const parts = series.s ? series.s.split('-').map(Number) : [0, 0];
  const [winsA, winsB] = [parts[0] || 0, parts[1] || 0];
  const decided = !!series.w;
  const mine = a?.id === userTeamId || b?.id === userTeamId;
  // A series that hasn't been played is 0-0, where `>=` would call BOTH sides
  // the leader and paint two green zeros. Nobody leads until someone does.
  const started = winsA > 0 || winsB > 0;

  const dense = width < 110; // round1: no room for a crest, tricode only
  const roomy = width >= 250; // conf finals / finals / play-in decider

  const logoSize = dense ? 0 : roomy ? 26 : 18;
  const nameSize = dense ? 10 : roomy ? 13 : 11;
  const statSize = dense ? 13 : roomy ? 22 : 16;
  const seedSize = dense ? 7.5 : 8.5;

  const TeamRow: React.FC<{ team: Team | null; wins: number; leads: boolean }> = ({ team, wins, leads }) => {
    if (!team) {
      return (
        <View className="flex-row items-center" style={{ gap: 6, paddingVertical: dense ? 2 : 4, opacity: 0.35 }}>
          <Text style={{ flex: 1, fontSize: nameSize, color: INK.faint, fontStyle: 'italic' }} numberOfLines={1}>
            {dense ? '—' : 'A definir'}
          </Text>
        </View>
      );
    }
    const dim = decided && !leads;
    return (
      <View className="flex-row items-center" style={{ gap: dense ? 4 : 7, paddingVertical: dense ? 2 : 4 }}>
        <MonoLabel size={seedSize} color={dim ? INK.faint : INK.meta} style={{ letterSpacing: 0, minWidth: dense ? 9 : 12 }}>
          {seeds(team.id)}
        </MonoLabel>
        {logoSize > 0 ? (
          <Image
            source={{ uri: getTeamLogoUrl(team) }}
            placeholder={{ uri: NBA_FALLBACK }}
            style={{ width: logoSize, height: logoSize, opacity: dim ? 0.45 : 1 }}
            contentFit="contain"
          />
        ) : null}
        <Text
          className="font-extrabold"
          numberOfLines={1}
          style={{ flex: 1, fontSize: nameSize, color: dim ? 'rgba(255,255,255,0.55)' : '#fff' }}
        >
          {roomy ? getTeamNickname(team) : getTeamTricode(team)}
        </Text>
        <Stat size={statSize} color={leads ? COLORS.goodSoft : 'rgba(255,255,255,0.5)'}>{wins}</Stat>
      </View>
    );
  };

  return (
    <View
      style={{
        width,
        backgroundColor: COLORS.panel,
        borderRadius: dense ? 9 : RADIUS.control,
        borderWidth: mine ? 1.5 : 1,
        borderColor: mine ? accent.primary : COLORS.line,
        paddingHorizontal: dense ? 7 : roomy ? 12 : 9,
        paddingVertical: dense ? 5 : roomy ? 9 : 7,
      }}
    >
      <TeamRow team={a} wins={winsA} leads={started && winsA >= winsB} />
      <View style={{ height: 1, backgroundColor: COLORS.line, marginVertical: dense ? 2 : 4 }} />
      <TeamRow team={b} wins={winsB} leads={started && winsB >= winsA} />

      {decider ? (
        <View
          style={{
            position: 'absolute', top: -6, right: -6, width: 11, height: 11, borderRadius: 6,
            backgroundColor: COLORS.cta, borderWidth: 1.5, borderColor: COLORS.bg,
          }}
        />
      ) : roomy && decided && series.w ? (
        <MonoLabel size={9} color={COLORS.goodSoft} style={{ marginTop: 8, textAlign: 'center', letterSpacing: 1 }}>
          {getTeamNickname(series.w)} avança
        </MonoLabel>
      ) : null}
    </View>
  );
};

/** Round 1 (4 series) → Round 2 (2 series) → Round 3 (1 series), each row
 * exactly as wide as the last, connected by the staple above. Only renders
 * once round1 is actually seeded — see the play-in branch in ConferenceTree. */
const RoundTree: React.FC<{
  round1: PlayoffSeries[];
  round2: PlayoffSeries[];
  round3: PlayoffSeries[];
  seeds: (teamId?: string) => number | string;
  userTeamId?: string;
  width: number;
  deciderIndex?: { round: 'round1' | 'round2' | 'round3'; index: number };
}> = ({ round1, round2, round3, seeds, userTeamId, width, deciderIndex }) => {
  const w1 = Math.max(0, (width - 3 * ROW_GAP) / 4);
  const w2 = Math.max(0, (width - ROW_GAP) / 2);

  return (
    <View>
      <View className="flex-row" style={{ gap: ROW_GAP }}>
        {round1.map((s, i) => (
          <BracketNode
            key={`r1-${i}`}
            series={s}
            seeds={seeds}
            userTeamId={userTeamId}
            width={w1}
            decider={deciderIndex?.round === 'round1' && deciderIndex.index === i}
          />
        ))}
      </View>

      <View className="flex-row" style={{ gap: ROW_GAP }}>
        <Connector width={w2} />
        <Connector width={w2} />
      </View>

      <View className="flex-row" style={{ gap: ROW_GAP }}>
        {round2.map((s, i) => (
          <BracketNode
            key={`r2-${i}`}
            series={s}
            seeds={seeds}
            userTeamId={userTeamId}
            width={w2}
            decider={deciderIndex?.round === 'round2' && deciderIndex.index === i}
          />
        ))}
      </View>

      <Connector width={width} />

      {round3.map((s, i) => (
        <BracketNode
          key={`r3-${i}`}
          series={s}
          seeds={seeds}
          userTeamId={userTeamId}
          width={width}
          decider={deciderIndex?.round === 'round3' && deciderIndex.index === i}
        />
      ))}
    </View>
  );
};

/** Play-in: 7v8 and 9v10 side by side, feeding the single final-seed game
 * below via the same staple connector — the shape is the same merge, it's
 * just win/loss (not simply "the winner") that decides who plays in it. */
const PlayInTree: React.FC<{
  playIn: PlayInBracket;
  playInSeeds: (teamId?: string) => number | string;
  userTeamId?: string;
  width: number;
}> = ({ playIn, playInSeeds, userTeamId, width }) => {
  const w2 = Math.max(0, (width - ROW_GAP) / 2);
  return (
    <View>
      <View className="flex-row" style={{ gap: ROW_GAP }}>
        <BracketNode series={playIn.sevenEight} seeds={playInSeeds} userTeamId={userTeamId} width={w2} />
        <BracketNode series={playIn.nineTen} seeds={playInSeeds} userTeamId={userTeamId} width={w2} />
      </View>
      <Connector width={width} />
      <BracketNode series={playIn.finalSeed} seeds={playInSeeds} userTeamId={userTeamId} width={width} />
    </View>
  );
};

const ConferenceTree: React.FC<{
  conference: PlayoffState['east'];
  label: string;
  labelColor: string;
  userTeamId?: string;
  width: number;
  deciderIndex?: { round: 'round1' | 'round2' | 'round3'; index: number };
}> = ({ conference, label, labelColor, userTeamId, width, deciderIndex }) => {
  const seeds = (teamId?: string) => {
    if (!teamId) return '?';
    const s = seedWithinConference(conference, teamId);
    return s !== -1 ? s : '?';
  };

  // Play-in comes first and alone: until it resolves there's no round 1 to show.
  if (conference.playIn && conference.bracket.round1.length === 0) {
    const playIn = conference.playIn;
    // Seeds here must come from the RAW standings order, not seedWithinConference:
    // that function reports the post-play-in seed a team will inherit (the 7v8
    // winner becomes 7, the final-seed winner becomes 8), so during the play-in
    // itself it labelled both sides of the 7v8 game "7º seed".
    const playInSeeds = (teamId?: string) => {
      if (!teamId) return '?';
      const i = conference.initialSeeds.findIndex((t) => t.id === teamId);
      return i !== -1 ? i + 1 : '?';
    };
    return (
      <View style={{ gap: 10 }}>
        <SectionLabel color={labelColor}>{label} · {ROUND_LABEL.playin}</SectionLabel>
        <PlayInTree playIn={playIn} playInSeeds={playInSeeds} userTeamId={userTeamId} width={width} />
      </View>
    );
  }

  if (conference.bracket.round1.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <SectionLabel color={labelColor}>{label} · Playoffs</SectionLabel>
      <RoundTree
        round1={conference.bracket.round1}
        round2={conference.bracket.round2}
        round3={conference.bracket.round3}
        seeds={seeds}
        userTeamId={userTeamId}
        width={width}
        deciderIndex={deciderIndex}
      />
    </View>
  );
};

const PlayoffBracket: React.FC<{ playoffState: PlayoffState | null; userTeamId?: string }> = ({
  playoffState,
  userTeamId,
}) => {
  // Measured off the wrapping View so every row's math (round1's 4-across,
  // the connectors, round3's single full-width box) shares one exact pixel
  // width — the initial guess just avoids a width-0 flash before layout.
  const [width, setWidth] = useState(() => Math.max(0, Dimensions.get('window').width - 28));

  if (!playoffState) return null;
  const pending = playoffState.pendingDecider;

  // Seeds for the Finals come from whichever conference the team belongs to.
  const finalsSeeds = (teamId?: string) => {
    if (!teamId) return '?';
    const east = seedWithinConference(playoffState.east, teamId);
    if (east !== -1) return east;
    const west = seedWithinConference(playoffState.west, teamId);
    return west !== -1 ? west : '?';
  };

  return (
    <View
      style={{ gap: 18 }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.round(w) !== Math.round(width)) setWidth(w);
      }}
    >
      {playoffState.finals ? (
        <View style={{ gap: 10 }}>
          <SectionLabel color={COLORS.gold}>{ROUND_LABEL.finals}</SectionLabel>
          <BracketNode
            series={playoffState.finals}
            seeds={finalsSeeds}
            userTeamId={userTeamId}
            width={width}
            decider={pending?.scope === 'finals'}
          />
        </View>
      ) : null}

      <ConferenceTree
        conference={playoffState.west}
        label="Oeste"
        labelColor={COLORS.badSoft}
        userTeamId={userTeamId}
        width={width}
        deciderIndex={pending?.scope === 'conference' && pending.conf === 'west' ? { round: pending.round, index: pending.index } : undefined}
      />
      <ConferenceTree
        conference={playoffState.east}
        label="Leste"
        labelColor={COLORS.info}
        userTeamId={userTeamId}
        width={width}
        deciderIndex={pending?.scope === 'conference' && pending.conf === 'east' ? { round: pending.round, index: pending.index } : undefined}
      />
    </View>
  );
};

export default PlayoffBracket;
