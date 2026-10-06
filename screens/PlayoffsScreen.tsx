import React from 'react';
import { View, Text } from 'react-native';

import { SeasonState, PlayoffSeries, PlayoffStage } from '../types';
import { getTeamNickname } from '../constants';
import { COLORS, FONT } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';
import Screen, { Body } from '../components/ui/Screen';
import { Panel, CtaButton, ScreenTitle, SectionLabel, BodyText, TeamBadge, Name, Dock } from '../components/ui/kit';
import PlayoffBracket, { seriesWins } from '../components/PlayoffBracket';

// Design 1d ("Transmissão"). The converging bracket (see PlayoffBracket), the
// stage as chips, your current series as its own card, and your run so far —
// "caminho até aqui" is the thing you want after four rounds.

interface PlayoffsScreenProps {
  season: SeasonState;
  onAdvanceRound: () => void;
  onResumeLiveGame: () => void;
}

const STAGE_LABEL: Record<string, string> = {
  none: 'Aguardando',
  playin: 'Play-in',
  round1: 'Primeira rodada',
  semis: 'Semifinais de conferência',
  confFinals: 'Finais de conferência',
  finals: 'Finais da NBA',
  complete: 'Campeão definido',
};

const STAGE_ORDER = ['playin', 'round1', 'semis', 'confFinals', 'finals'] as const;
const STAGE_SHORT: Record<(typeof STAGE_ORDER)[number], string> = {
  playin: 'Play-in',
  round1: '1ª rodada',
  semis: 'Semis',
  confFinals: 'Finais conf',
  finals: 'Finais',
};

/**
 * Where the bracket actually is. SeasonState.playoffStage exists but nothing
 * ever advances it — App.tsx only ever writes 'none' — so trusting it left this
 * screen permanently titled "Aguardando" with every stage chip dimmed, even
 * mid-Finals. Reading the bracket itself is the only source of truth.
 */
const deriveStage = (season: SeasonState): PlayoffStage => {
  const p = season.playoff;
  if (!p) return 'none';
  if (p.champion) return 'complete';
  if (p.finals) return 'finals';
  const hasTeams = (list: PlayoffSeries[]) => list.some((s) => s.m[0] || s.m[1]);
  if (hasTeams(p.east.bracket.round3) || hasTeams(p.west.bracket.round3)) return 'confFinals';
  if (hasTeams(p.east.bracket.round2) || hasTeams(p.west.bracket.round2)) return 'semis';
  if (hasTeams(p.east.bracket.round1) || hasTeams(p.west.bracket.round1)) return 'round1';
  if (p.east.playIn || p.west.playIn) return 'playin';
  return 'none';
};

const PlayoffsScreen: React.FC<PlayoffsScreenProps> = ({ season, onAdvanceRound, onResumeLiveGame }) => {
  const { accent } = useTheme();
  const stage = deriveStage(season);
  const stageIndex = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);

  // Every series the user has already played, in order — their run so far.
  const path: { round: string; opponent: string; score: string; won: boolean }[] = [];
  if (season.playoff) {
    const rounds: [string, PlayoffSeries[]][] = [
      ['1ª rodada', [...season.playoff.east.bracket.round1, ...season.playoff.west.bracket.round1]],
      ['Semis', [...season.playoff.east.bracket.round2, ...season.playoff.west.bracket.round2]],
      ['Finais conf', [...season.playoff.east.bracket.round3, ...season.playoff.west.bracket.round3]],
      ['Finais', season.playoff.finals ? [season.playoff.finals] : []],
    ];
    rounds.forEach(([label, list]) => {
      list.forEach((s) => {
        if (!s.w || !s.s) return;
        const mineIdx = s.m.findIndex((t) => t?.id === season.userTeamId);
        if (mineIdx === -1) return;
        const other = s.m[1 - mineIdx];
        const parts = s.s.split('-').map(Number);
        const mine = parts[mineIdx] ?? 0;
        const theirs = parts[1 - mineIdx] ?? 0;
        path.push({
          round: label,
          opponent: getTeamNickname(other ?? undefined),
          score: `${mine}-${theirs}`,
          won: s.w.id === season.userTeamId,
        });
      });
    });
  }

  // The user's series right now: the one still being played, else the last
  // one they played.
  const allSeries: PlayoffSeries[] = season.playoff
    ? [
        ...season.playoff.west.bracket.round1, ...season.playoff.east.bracket.round1,
        ...season.playoff.west.bracket.round2, ...season.playoff.east.bracket.round2,
        ...season.playoff.west.bracket.round3, ...season.playoff.east.bracket.round3,
        ...(season.playoff.finals ? [season.playoff.finals] : []),
      ]
    : [];
  const mineAll = allSeries.filter((s) => s.m.some((t) => t?.id === season.userTeamId) && s.m[0] && s.m[1]);
  const current = mineAll.find((s) => !s.w) ?? mineAll[mineAll.length - 1];
  const curIdx = current ? current.m.findIndex((t) => t?.id === season.userTeamId) : -1;
  const curOpp = current && curIdx !== -1 ? current.m[1 - curIdx] : null;
  const [w0, w1] = current ? seriesWins(current) : [0, 0];
  const myWins = curIdx === 0 ? w0 : w1;
  const oppWins = curIdx === 0 ? w1 : w0;
  const played = myWins + oppWins;

  return (
    <Screen
      heroHeight={120}
      footer={
        season.liveGame ? (
          <Dock><CtaButton label="Jogar o jogo 7" sub="Ao vivo" onPress={onResumeLiveGame} /></Dock>
        ) : season.status === 'playoffs_idle' ? (
          <Dock><CtaButton label="Simular rodada" sub={STAGE_SHORT[stage as (typeof STAGE_ORDER)[number]] ?? ''} onPress={onAdvanceRound} /></Dock>
        ) : undefined
      }
    >
      <ScreenTitle label={`Temporada ${season.gmLegacy.seasons + 1} · ${STAGE_LABEL[stage] ?? ''}`} title="Playoffs" />
      <View className="flex-row flex-wrap" style={{ gap: 6, paddingHorizontal: 20, marginTop: -4 }}>
        {STAGE_ORDER.map((s, i) => {
          const done = stageIndex > i;
          const cur = stageIndex === i;
          return (
            <View
              key={s}
              style={{ paddingHorizontal: 10, height: 28, justifyContent: 'center', borderRadius: 9, backgroundColor: cur ? COLORS.ctaFill : COLORS.surface2 }}
            >
              <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1, color: cur ? COLORS.ctaInk : done ? COLORS.muted : COLORS.faint, textTransform: 'uppercase' }}>
                {STAGE_SHORT[s]}{done ? ' ✓' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      <Body top={16} gap={16}>
        {season.playoff ? (
          <PlayoffBracket playoffState={season.playoff} userTeamId={season.userTeamId} />
        ) : (
          <Panel>
            <SectionLabel>Ainda não</SectionLabel>
            <BodyText style={{ marginTop: 6 }}>Os playoffs começam depois dos 82 jogos da temporada regular.</BodyText>
          </Panel>
        )}

        {current && curOpp ? (
          <Panel bar={accent.primary} style={{ gap: 12 }}>
            <SectionLabel>{current.w ? (current.w.id === season.userTeamId ? 'Sua série · vencida' : 'Sua série · eliminado') : 'Sua série'}</SectionLabel>
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <TeamBadge teamId={season.userTeamId} width={44} height={30} />
              <Text style={{ fontFamily: FONT.cond800, fontSize: 34, lineHeight: 34, color: COLORS.text, fontVariant: ['tabular-nums'] }}>
                {myWins}–{oppWins}
              </Text>
              <TeamBadge teamId={curOpp.id} width={44} height={30} />
              <View className="flex-1" />
            </View>
            <View className="flex-row" style={{ gap: 5 }}>
              {Array.from({ length: 7 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: i < played ? COLORS.surface2 : 'transparent',
                    borderWidth: i === played && !current.w ? 1 : 0, borderColor: COLORS.text,
                  }}
                >
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 12, color: i < played ? COLORS.muted : COLORS.faint }}>{i + 1}</Text>
                </View>
              ))}
            </View>
          </Panel>
        ) : null}

        {path.length > 0 ? (
          <Panel padding={0}>
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
              <SectionLabel>Caminho até aqui</SectionLabel>
            </View>
            {path.map((p, i) => (
              <View key={i} className="flex-row items-center" style={{ gap: 10, height: 40, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.lineSoft }}>
                <Text style={{ width: 74, fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 0.8, color: COLORS.dim, textTransform: 'uppercase' }}>{p.round}</Text>
                <Name size={15} style={{ flex: 1 }}>vs {p.opponent}</Name>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 17, color: p.won ? COLORS.good : COLORS.bad }}>{p.score}</Text>
              </View>
            ))}
          </Panel>
        ) : null}
      </Body>
    </Screen>
  );
};

export default PlayoffsScreen;
