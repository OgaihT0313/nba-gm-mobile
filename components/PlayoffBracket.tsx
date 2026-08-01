import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

import { PlayoffState, PlayoffSeries, Team } from '../types';
import { getTeamLogoUrl, getTeamNickname } from '../constants';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import { Panel, MonoLabel, Stat, SectionLabel } from './ui/kit';

// Design 3c. The old bracket was the web layout ported literally: a 1200px-wide
// horizontal scroll with 192px cards, which on a phone meant dragging sideways
// and reading three-letter tricodes. The redesign turns it into a COLUMN — one
// series per card, top to bottom, your team always visibly marked — which is
// what actually fits a 390px screen.

const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const ROUND_LABEL: Record<string, string> = {
  playin: 'Play-in',
  round1: 'Primeira rodada',
  round2: 'Semifinais de conferência',
  round3: 'Final de conferência',
  finals: 'Finais da NBA',
};

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

/** One side of a series. */
const SeriesSide: React.FC<{
  team: Team | null;
  seed: number | string;
  wins: number;
  leads: boolean;
  decided: boolean;
}> = ({ team, seed, wins, leads, decided }) => {
  if (!team) {
    return (
      <View className="flex-row items-center" style={{ gap: 11, opacity: 0.35 }}>
        <View style={{ width: 32, height: 32, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }} />
        <Text style={{ flex: 1, fontSize: 13, color: INK.faint, fontStyle: 'italic' }}>A definir</Text>
      </View>
    );
  }
  // Once a series is over the loser dims; while it's live neither side does.
  const dim = decided && !leads;
  return (
    <View className="flex-row items-center" style={{ gap: 11 }}>
      <Image
        source={{ uri: getTeamLogoUrl(team) }}
        placeholder={{ uri: NBA_FALLBACK }}
        style={{ width: 32, height: 32, opacity: dim ? 0.5 : 1 }}
        contentFit="contain"
      />
      <View style={{ flex: 1 }}>
        <Text
          className="font-extrabold"
          style={{ fontSize: 13, color: dim ? 'rgba(255,255,255,0.7)' : '#fff' }}
          numberOfLines={1}
        >
          {getTeamNickname(team)}
        </Text>
        <MonoLabel size={9.5} color={dim ? 'rgba(255,255,255,0.35)' : INK.meta} style={{ letterSpacing: 0 }}>
          {seed}º seed
        </MonoLabel>
      </View>
      <Stat size={26} color={leads ? COLORS.goodSoft : 'rgba(255,255,255,0.5)'}>{wins}</Stat>
    </View>
  );
};

/** A whole series as one card. */
export const SeriesCard: React.FC<{
  series: PlayoffSeries;
  seeds: (teamId?: string) => number | string;
  userTeamId?: string;
  /** Set when this exact series is the paused Game 7 the user plays live. */
  decider?: boolean;
}> = ({ series, seeds, userTeamId, decider }) => {
  const { accent } = useTheme();
  const [a, b] = series.m;
  const parts = series.s ? series.s.split('-').map(Number) : [0, 0];
  const [winsA, winsB] = [parts[0] || 0, parts[1] || 0];
  const decided = !!series.w;
  const mine = a?.id === userTeamId || b?.id === userTeamId;
  // A series that hasn't been played is 0-0, where `>=` would call BOTH sides
  // the leader and paint two green zeros. Nobody leads until someone does.
  const started = winsA > 0 || winsB > 0;

  return (
    <Panel highlight={mine ? accent.primary : undefined} padding={14}>
      <SeriesSide team={a} seed={seeds(a?.id)} wins={winsA} leads={started && winsA >= winsB} decided={decided} />
      <View style={{ height: 1, backgroundColor: COLORS.line, marginVertical: 11 }} />
      <SeriesSide team={b} seed={seeds(b?.id)} wins={winsB} leads={started && winsB >= winsA} decided={decided} />

      {decider ? (
        <View
          style={{
            marginTop: 12, paddingVertical: 9, paddingHorizontal: 11, borderRadius: RADIUS.control,
            backgroundColor: withAlpha(COLORS.cta, 0.13), borderWidth: 1, borderColor: withAlpha(COLORS.cta, 0.35),
          }}
        >
          <MonoLabel size={10} color={COLORS.badSoft} style={{ textAlign: 'center', letterSpacing: 1.2 }}>
            Jogo 7 decisivo — você comanda ao vivo
          </MonoLabel>
        </View>
      ) : decided && series.w ? (
        <MonoLabel size={9.5} color={COLORS.goodSoft} style={{ marginTop: 12, textAlign: 'center', letterSpacing: 1 }}>
          {getTeamNickname(series.w)} avançam
        </MonoLabel>
      ) : null}
    </Panel>
  );
};

/** Every live/finished series in one conference, newest round first. */
const ConferenceColumn: React.FC<{
  conference: PlayoffState['east'];
  label: string;
  labelColor: string;
  userTeamId?: string;
  deciderIndex?: { round: 'round1' | 'round2' | 'round3'; index: number };
}> = ({ conference, label, labelColor, userTeamId, deciderIndex }) => {
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
        {[playIn.sevenEight, playIn.nineTen, playIn.finalSeed].map((s, i) => (
          <SeriesCard key={i} series={s} seeds={playInSeeds} userTeamId={userTeamId} />
        ))}
      </View>
    );
  }

  const rounds: { key: 'round3' | 'round2' | 'round1'; list: PlayoffSeries[] }[] = [
    { key: 'round3', list: conference.bracket.round3 },
    { key: 'round2', list: conference.bracket.round2 },
    { key: 'round1', list: conference.bracket.round1 },
  ];

  return (
    <View style={{ gap: 10 }}>
      {rounds
        .filter((r) => r.list.length > 0)
        .map((r) => (
          <View key={r.key} style={{ gap: 10 }}>
            <SectionLabel color={labelColor}>{label} · {ROUND_LABEL[r.key]}</SectionLabel>
            {r.list.map((s, i) => (
              <SeriesCard
                key={i}
                series={s}
                seeds={seeds}
                userTeamId={userTeamId}
                decider={deciderIndex?.round === r.key && deciderIndex.index === i}
              />
            ))}
          </View>
        ))}
    </View>
  );
};

const PlayoffBracket: React.FC<{ playoffState: PlayoffState | null; userTeamId?: string }> = ({
  playoffState,
  userTeamId,
}) => {
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
    <View style={{ gap: 14 }}>
      {playoffState.finals ? (
        <View style={{ gap: 10 }}>
          <SectionLabel color={COLORS.gold}>{ROUND_LABEL.finals}</SectionLabel>
          <SeriesCard
            series={playoffState.finals}
            seeds={finalsSeeds}
            userTeamId={userTeamId}
            decider={pending?.scope === 'finals'}
          />
        </View>
      ) : null}

      <ConferenceColumn
        conference={playoffState.west}
        label="Oeste"
        labelColor={COLORS.badSoft}
        userTeamId={userTeamId}
        deciderIndex={pending?.scope === 'conference' && pending.conf === 'west' ? { round: pending.round, index: pending.index } : undefined}
      />
      <ConferenceColumn
        conference={playoffState.east}
        label="Leste"
        labelColor={COLORS.info}
        userTeamId={userTeamId}
        deciderIndex={pending?.scope === 'conference' && pending.conf === 'east' ? { round: pending.round, index: pending.index } : undefined}
      />
    </View>
  );
};

export default PlayoffBracket;
