// Minha Carreira, the season: four tabs over the same career.
//   Hoje      -- you, your role and the coach's trust, the next game, the
//                last ones, what's been happening to you.
//   Treino    -- this week's training and the development points to spend.
//   Time      -- your team as the coach orders it, you among them.
//   Carreira  -- the record: draft, seasons, honors, totals.
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { COLORS, FONT, withAlpha, onAccent, ovrColor } from '../../src/theme/tokens';
import { getTeamAccent, getTeamNickname, getTeamTricode } from '../../constants';
import type { PlayerAttributes } from '../../types';
import { personalityOf } from '../../services/personalityService';
import { sortStandings } from '../../services/scheduleService';
import { TeamBadge } from '../../components/ui/kit';
import type { CareerState, WeeklyTraining } from '../../services/career/careerTypes';
import { me, myTeam, nextGame, seasonLabel } from '../../services/career/careerLeague';
import { roleOf, TRAINING_META, canSpend, pointCost, getRotationWeightsFor } from '../../services/career/careerTrust';
import { styleById } from '../../services/career/careerCreate';
import { Page, Label, Title, Body, Box, Option, Bar, Tabs, Cta, Ghost } from './careerUi';

type Tab = 'hoje' | 'treino' | 'time' | 'carreira';
const TABS: { id: Tab; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'treino', label: 'Treino' },
  { id: 'time', label: 'Time' },
  { id: 'carreira', label: 'Carreira' },
];

const ATTR_LABEL: Record<keyof PlayerAttributes, string> = {
  shooting: 'Arremesso', finishing: 'Finalização', playmaking: 'Armação', perimeterD: 'Def. perímetro',
  interiorD: 'Def. interior', rebounding: 'Rebote', athleticism: 'Atletismo',
};

export interface HubActions {
  simGame: () => void;
  simDays: (n: number) => void;
  simToEnd: () => void;
  simPlayoffRound: () => void;
  nextSeason: () => void;
  setTraining: (t: WeeklyTraining) => void;
  spend: (k: keyof PlayerAttributes) => void;
  exit: () => void;
}

const trustLabel = (t: number) => (t >= 75 ? 'O técnico confia em você' : t >= 58 ? 'Ganhando a confiança' : t >= 42 ? 'Ainda te avaliando' : t >= 25 ? 'Pouca confiança' : 'Na geladeira');
const trustColor = (t: number) => (t >= 58 ? COLORS.good : t >= 42 ? COLORS.text : t >= 25 ? COLORS.warn : COLORS.bad);

const CareerHub: React.FC<{ career: CareerState; busy: string | null; actions: HubActions }> = ({ career, busy, actions }) => {
  const [tab, setTab] = useState<Tab>('hoje');
  const team = myTeam(career);
  const accent = getTeamAccent(team?.id);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'hoje' ? <Today career={career} busy={busy} actions={actions} /> : null}
        {tab === 'treino' ? <Training career={career} actions={actions} /> : null}
        {tab === 'time' ? <TeamTab career={career} /> : null}
        {tab === 'carreira' ? <CareerTab career={career} actions={actions} /> : null}
      </View>
      <Tabs tabs={TABS} active={tab} onChange={setTab} accent={accent.primary} />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Hoje                                                                 */
/* ------------------------------------------------------------------ */

const Hero: React.FC<{ career: CareerState }> = ({ career }) => {
  const p = me(career)!;
  const team = myTeam(career);
  const accent = getTeamAccent(team?.id);
  const ink = onAccent(accent.primary);
  const role = roleOf(career);
  const st = p.seasonStats;
  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.5, color: withAlpha(ink, 0.75), textTransform: 'uppercase' }}>
          {seasonLabel(career)} · {team ? getTeamNickname(team) : 'Sem time'}
        </Text>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.5, color: withAlpha(ink, 0.75), textTransform: 'uppercase' }}>
          {p.age} anos · {personalityOf(p).label}
        </Text>
      </View>
      <View className="flex-row items-end justify-between">
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: withAlpha(ink, 0.8) }}>#{p.number} · {p.pos} · {styleById(career.creation.style).label}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONT.cond800, fontSize: 36, lineHeight: 38, color: ink, textTransform: 'uppercase' }}>{p.name}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 44, lineHeight: 46, color: ink }}>{p.ovr}</Text>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.4, color: withAlpha(ink, 0.7) }}>GERAL</Text>
        </View>
      </View>
      <View style={{ backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, gap: 8 }}>
        <View className="flex-row items-center justify-between">
          <Label>Papel</Label>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text, textTransform: 'uppercase' }}>{role.label}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Label>Confiança do técnico</Label>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: trustColor(career.trust) }}>{trustLabel(career.trust)}</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.sunken, overflow: 'hidden' }}>
          <View style={{ width: `${career.trust}%`, height: '100%', backgroundColor: trustColor(career.trust) }} />
        </View>
        <View className="flex-row" style={{ marginTop: 4 }}>
          {[['Jogos', st?.gp ?? 0, 0], ['Min', st?.mpg ?? 0, 1], ['Pts', st?.ppg ?? 0, 1], ['Reb', st?.rpg ?? 0, 1], ['Ast', st?.apg ?? 0, 1]].map(([l, v, d], i) => (
            <View key={l as string} style={{ flex: 1, borderLeftWidth: i ? 1 : 0, borderLeftColor: COLORS.line, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text }}>{(v as number).toFixed(d as number)}</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.1, color: COLORS.muted, textTransform: 'uppercase' }}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const GameRow: React.FC<{ career: CareerState; g: CareerState['games'][number] }> = ({ career, g }) => {
  const opp = career.league.teams.find((t) => t.id === g.opponentId);
  const won = g.teamScore > g.oppScore;
  const l = g.line;
  return (
    <View className="flex-row items-center" style={{ gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.line }}>
      <Text style={{ width: 22, fontFamily: FONT.cond800, fontSize: 15, color: won ? COLORS.good : COLORS.bad }}>{won ? 'V' : 'D'}</Text>
      <Text style={{ width: 84, fontFamily: FONT.cond700, fontSize: 14, color: COLORS.textSoft }}>{g.home ? 'vs' : '@'} {getTeamTricode(opp)} {g.teamScore}-{g.oppScore}</Text>
      <Text style={{ flex: 1, fontFamily: FONT.cond700, fontSize: 14, color: l ? COLORS.text : COLORS.dim, textAlign: 'right' }}>
        {l ? `${l.pts} pts · ${l.reb} reb · ${l.ast} ast · ${l.min} min` : 'Não jogou'}
      </Text>
    </View>
  );
};

const Today: React.FC<{ career: CareerState; busy: string | null; actions: HubActions }> = ({ career, busy, actions }) => {
  const team = myTeam(career);
  const accent = getTeamAccent(team?.id);
  const lg = career.league;
  const ng = nextGame(career);
  const opp = ng ? lg.teams.find((t) => t.id === ng.opponentId) : undefined;
  const recent = [...career.games].slice(-6).reverse();
  const champion = lg.status === 'offseason' ? lg.teams.find((t) => t.id === lg.awardHistory[lg.awardHistory.length - 1]?.championId) : undefined;
  const inPlayoffs = lg.status !== 'active' && lg.status !== 'offseason';
  // Is your team still alive in the bracket?
  const alive = (() => {
    const pf = lg.playoff;
    if (!pf || !team) return false;
    const conf = team.conference === 'East' ? pf.east : pf.west;
    const series = [...Object.values(conf.bracket ?? {}).flat(), pf.finals].filter(Boolean) as { m: ({ id: string } | null)[]; w?: { id: string } | null }[];
    const inSeries = series.filter((s) => s.m.some((t) => t?.id === team.id));
    // Before the bracket fills (the play-in), the top ten are still in it.
    if (!inSeries.length) {
      const bracketOpen = conf.bracket.round1.some((s) => s.m.some(Boolean));
      return !bracketOpen && (conf.initialSeeds ?? []).slice(0, 10).some((t) => t.id === team.id);
    }
    return !inSeries.some((s) => s.w && s.w.id !== team.id);
  })();
  const standing = team && lg.gamesPlayed > 0
    ? sortStandings(lg.teams.filter((t) => t.conference === team.conference), lg.schedule).findIndex((t) => t.id === team.id) + 1
    : 0;

  let dock: React.ReactNode;
  if (busy) dock = <Cta label={busy} onPress={() => {}} disabled />;
  else if (lg.status === 'active') dock = (
    <View style={{ gap: 8 }}>
      <Cta label="Simular jogo" sub={ng ? `Dia ${ng.day} ›` : undefined} onPress={actions.simGame} />
      <View className="flex-row" style={{ gap: 8 }}>
        <Ghost label="+7 dias" onPress={() => actions.simDays(7)} style={{ flex: 1 }} />
        <Ghost label="Até o fim" onPress={actions.simToEnd} style={{ flex: 1 }} />
      </View>
    </View>
  );
  else if (inPlayoffs) dock = <Cta label="Simular rodada" sub="Playoffs ›" onPress={actions.simPlayoffRound} />;
  else dock = <Cta label="Próxima temporada" sub="Verão ›" onPress={actions.nextSeason} />;

  return (
    <Page band={{ color: accent.primary, height: 150 }} dock={dock}>
      <Hero career={career} />

      {lg.status === 'active' && ng && opp ? (
        <Box>
          <View className="flex-row items-center justify-between">
            <Label>Próximo jogo · dia {ng.day}</Label>
            <Label>{team ? `${team.wins ?? 0}-${team.losses ?? 0}${standing ? ` · ${standing}º no ${team.conference === 'East' ? 'Leste' : 'Oeste'}` : ''}` : ''}</Label>
          </View>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <TeamBadge teamId={opp.id} width={44} height={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text, textTransform: 'uppercase' }}>{ng.home ? 'vs' : '@'} {getTeamNickname(opp)}</Text>
              <Body>{opp.wins ?? 0}-{opp.losses ?? 0} · {ng.home ? 'em casa' : 'fora'}</Body>
            </View>
          </View>
        </Box>
      ) : null}

      {inPlayoffs ? (
        <Box>
          <Label>Playoffs</Label>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text, textTransform: 'uppercase' }}>
            {alive ? `${team ? getTeamNickname(team) : 'Seu time'} segue vivo` : 'Seu time está fora'}
          </Text>
          <Body>{alive ? 'Cada rodada é uma série melhor de sete.' : 'A temporada acabou para vocês. Simule até o campeão.'}</Body>
        </Box>
      ) : null}

      {champion ? (
        <Box highlight={COLORS.gold}>
          <Label color={COLORS.gold}>Temporada encerrada</Label>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text, textTransform: 'uppercase' }}>{getTeamNickname(champion)} campeão</Text>
          <Body>{champion.id === team?.id ? 'E você tem um anel.' : 'O verão chega: evolução, draft, agência livre. Depois, a próxima temporada.'}</Body>
        </Box>
      ) : null}

      {recent.length ? (
        <Box>
          <Label>Últimos jogos</Label>
          {recent.map((g) => <GameRow key={g.day} career={career} g={g} />)}
        </Box>
      ) : null}

      {career.feed.length ? (
        <Box>
          <Label>Sua história</Label>
          {career.feed.slice(0, 5).map((f, i) => <Body key={i} color={i === 0 ? COLORS.text : COLORS.muted}>{f.text}</Body>)}
        </Box>
      ) : null}
      <Ghost label="Sair para o início" onPress={actions.exit} />
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Treino                                                               */
/* ------------------------------------------------------------------ */

const Training: React.FC<{ career: CareerState; actions: HubActions }> = ({ career, actions }) => {
  const p = me(career)!;
  const style = styleById(career.creation.style);
  return (
    <Page>
      <Label>Treino · semana a semana</Label>
      <Title>Treino</Title>
      <Box>
        <Label>Foco da semana</Label>
        <View style={{ gap: 6 }}>
          {(Object.keys(TRAINING_META) as WeeklyTraining[]).map((t) => (
            <Option key={t} label={TRAINING_META[t].label} sub={TRAINING_META[t].blurb} active={career.training === t} onPress={() => actions.setTraining(t)} />
          ))}
        </View>
      </Box>
      <Box>
        <View className="flex-row items-center justify-between">
          <Label>Pontos de evolução</Label>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text }}>{career.devPoints}</Text>
        </View>
        <Body size={12.5}>Vêm do treino e dos jogos de destaque. Cada ponto de atributo custa mais quanto melhor você já é nele; a cada quatro, sobe o seu ataque ou a sua defesa.</Body>
        <View style={{ gap: 8, marginTop: 4 }}>
          {(Object.keys(ATTR_LABEL) as (keyof PlayerAttributes)[]).map((k) => {
            const v = p.attributes?.[k] ?? 60;
            const ok = canSpend(career, k);
            return (
              <Bar key={k} label={ATTR_LABEL[k]} value={v}
                color={style.strengths.includes(k) ? COLORS.good : k === style.weakness ? COLORS.warn : COLORS.text}
                right={(
                  <Pressable accessibilityRole="button" accessibilityLabel={`Melhorar ${ATTR_LABEL[k]}`} onPress={ok.ok ? () => actions.spend(k) : undefined} className="active:opacity-70"
                    style={{ width: 52, height: 30, borderRadius: 8, backgroundColor: ok.ok ? COLORS.text : COLORS.sunken, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: FONT.cond800, fontSize: 14, color: ok.ok ? COLORS.bg : COLORS.dim }}>+1 · {pointCost(v)}</Text>
                  </Pressable>
                )} />
            );
          })}
        </View>
        {p.ovr >= career.ceiling ? <Body color={COLORS.warn}>Você chegou ao teto do seu talento por enquanto. Os pontos ficam guardados.</Body> : null}
      </Box>
      <Box>
        <View className="flex-row justify-between"><Label>Ataque</Label><Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text }}>{p.off}</Text></View>
        <View className="flex-row justify-between"><Label>Defesa</Label><Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text }}>{p.def}</Text></View>
        <View className="flex-row justify-between"><Label>Desgaste</Label><Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: (p.load ?? 0) > 60 ? COLORS.warn : COLORS.text }}>{Math.round(p.load ?? 0)}</Text></View>
      </Box>
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Time                                                                 */
/* ------------------------------------------------------------------ */

const TeamTab: React.FC<{ career: CareerState }> = ({ career }) => {
  const team = myTeam(career);
  if (!team) return <Page><Title>Sem time</Title></Page>;
  const lg = career.league;
  const order = getRotationWeightsFor(career);
  const rest = team.roster.filter((id) => !order.includes(id));
  const ids = [...order, ...rest];
  return (
    <Page>
      <Label>{getTeamNickname(team)} · {team.wins ?? 0}-{team.losses ?? 0}</Label>
      <Title>Seu time</Title>
      <Body>Na ordem em que o técnico distribui os minutos. A confiança dele em você entra nessa conta.</Body>
      <Box>
        {ids.map((id, i) => {
          const p = lg.players[id];
          if (!p) return null;
          const isMe = id === career.meId;
          return (
            <View key={id} className="flex-row items-center" style={{ gap: 10, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.line, backgroundColor: isMe ? withAlpha(COLORS.text, 0.08) : 'transparent', marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 6 }}>
              <Text style={{ width: 20, fontFamily: FONT.cond700, fontSize: 13, color: COLORS.dim }}>{i < order.length ? i + 1 : '–'}</Text>
              <Text style={{ width: 28, fontFamily: FONT.cond800, fontSize: 16, color: ovrColor(p.ovr) }}>{p.ovr}</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: isMe ? FONT.cond800 : FONT.cond700, fontSize: 15.5, color: COLORS.text }}>{p.name}{team.playerAbsences?.[id] ? ' · lesionado' : ''}</Text>
              <Text style={{ width: 30, fontFamily: FONT.cond700, fontSize: 13, color: COLORS.muted }}>{p.pos}</Text>
              <Text style={{ width: 54, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 13, color: COLORS.textSoft }}>{(p.seasonStats?.mpg ?? 0).toFixed(1)} min</Text>
            </View>
          );
        })}
      </Box>
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Carreira                                                             */
/* ------------------------------------------------------------------ */

const CareerTab: React.FC<{ career: CareerState; actions: HubActions }> = ({ career }) => {
  const p = me(career)!;
  const c = p.career;
  const honors = career.seasons.flatMap((s) => s.honors);
  const count = (h: string) => honors.filter((x) => x === h).length;
  return (
    <Page>
      <Label>{p.name} · {career.draft?.label ?? ''}{career.draft?.teamId ? ` pelo ${getTeamNickname(career.league.teams.find((t) => t.id === career.draft!.teamId))}` : ''}</Label>
      <Title>Carreira</Title>
      <Box>
        <View className="flex-row">
          {[['Temporadas', career.seasons.length], ['Jogos', c?.gp ?? 0], ['Pontos', c?.pts ?? 0], ['Títulos', count('Campeão')]].map(([l, v], i) => (
            <View key={l as string} style={{ flex: 1, borderLeftWidth: i ? 1 : 0, borderLeftColor: COLORS.line, paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text }}>{v}</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.1, color: COLORS.muted, textTransform: 'uppercase' }}>{l}</Text>
            </View>
          ))}
        </View>
        {honors.length ? (
          <Body color={COLORS.text}>{[...new Set(honors)].map((h) => `${h}${count(h) > 1 ? ` ×${count(h)}` : ''}`).join(' · ')}</Body>
        ) : <Body>Nenhum prêmio ainda.</Body>}
      </Box>
      <Box>
        <Label>Temporada a temporada</Label>
        {career.seasons.length === 0 ? <Body>A primeira temporada ainda está em andamento.</Body> : null}
        {[...career.seasons].reverse().map((s) => (
          <View key={s.season} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.line, gap: 2 }}>
            <View className="flex-row items-center justify-between">
              <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: COLORS.text }}>{s.label} · {s.teamId.toUpperCase()} · {s.role}</Text>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: ovrColor(s.ovr) }}>{s.ovr}</Text>
            </View>
            <Body>{s.gp} jogos · {s.mpg.toFixed(1)} min · {s.ppg.toFixed(1)} pts · {s.rpg.toFixed(1)} reb · {s.apg.toFixed(1)} ast · time {s.teamWins}-{s.teamLosses}</Body>
            {s.honors.length ? <Body color={COLORS.gold}>{s.honors.join(' · ')}</Body> : null}
          </View>
        ))}
      </Box>
    </Page>
  );
};

export default CareerHub;
