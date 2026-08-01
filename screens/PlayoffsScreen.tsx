import React from 'react';
import { View, Text } from 'react-native';

import { SeasonState, PlayoffSeries, PlayoffStage } from '../types';
import { getTeamNickname } from '../constants';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, HeroTitle, Stat, CtaButton } from '../components/ui/kit';
import PlayoffBracket from '../components/PlayoffBracket';

// Design 3c. Column bracket (see PlayoffBracket), the stage as chips on the
// hero, and your own run summarised at the bottom — "caminho até aqui" is the
// thing you actually want after four rounds, and the bracket alone never
// answered it without scrolling back through every card.

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

  return (
    <Screen
      heroHeight={140}
      footer={
        season.liveGame ? (
          <CtaButton label="Jogar o jogo 7" sub="Você comanda ao vivo" onPress={onResumeLiveGame} />
        ) : season.status === 'playoffs_idle' ? (
          <CtaButton label="Simular rodada" sub={STAGE_LABEL[stage] ?? ''} onPress={onAdvanceRound} />
        ) : undefined
      }
    >
      <HeroContent>
        <Eyebrow>Playoffs · temporada {season.gmLegacy.seasons + 1}</Eyebrow>
        <HeroTitle size={26} style={{ marginTop: 9 }} numberOfLines={2} adjustsFontSizeToFit>
          {STAGE_LABEL[stage] ?? 'Playoffs'}
        </HeroTitle>
        <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: 13 }}>
          {STAGE_ORDER.map((s, i) => {
            const done = stageIndex > i;
            const current = stageIndex === i;
            return (
              <View
                key={s}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
                  backgroundColor: current ? '#fff' : 'rgba(0,0,0,0.3)',
                }}
              >
                <MonoLabel
                  size={9.5}
                  color={current ? COLORS.bg : done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)'}
                  style={{ letterSpacing: 0.4 }}
                >
                  {STAGE_SHORT[s]}{done ? ' ✓' : ''}
                </MonoLabel>
              </View>
            );
          })}
        </View>
      </HeroContent>

      <Body top={18} gap={14}>
        {season.playoff ? (
          <PlayoffBracket playoffState={season.playoff} userTeamId={season.userTeamId} />
        ) : (
          <Panel padding={16}>
            <MonoLabel>Ainda não</MonoLabel>
            <Text style={{ fontSize: 12, lineHeight: 18, color: INK.body, marginTop: 8 }}>
              Os playoffs começam depois dos 82 jogos da temporada regular.
            </Text>
          </Panel>
        )}

        {path.length > 0 ? (
          <Panel padding={13}>
            <MonoLabel style={{ marginBottom: 10 }}>Caminho até aqui</MonoLabel>
            <View style={{ gap: 8 }}>
              {path.map((p, i) => (
                <View key={i} className="flex-row items-center" style={{ gap: 10 }}>
                  <MonoLabel size={9.5} color={INK.faint} style={{ width: 62, letterSpacing: 0 }}>{p.round}</MonoLabel>
                  <Text style={{ flex: 1, fontSize: 11, color: COLORS.textSoft }} numberOfLines={1}>vs {p.opponent}</Text>
                  <Stat size={11} color={p.won ? COLORS.goodSoft : COLORS.badSoft}>{p.score}</Stat>
                </View>
              ))}
            </View>
          </Panel>
        ) : null}
      </Body>
    </Screen>
  );
};

export default PlayoffsScreen;
