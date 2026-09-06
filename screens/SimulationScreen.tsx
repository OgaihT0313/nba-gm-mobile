import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { SeasonState, Team } from '../types';
import {
  getTeamSalary, SALARY_CAP, getTeamLogoUrl, getTeamNickname, getTeamCity,
  conferenceLabel, attributeColor,
} from '../constants';
import { MANDATE_META, confidenceZone, ZONE_META } from '../services/ownerService';
import { recentForm, currentStreak, nextGame, winProbability } from '../services/formService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import {
  Panel, MonoLabel, Eyebrow, HeroTitle, Stat, Meter, Chip, CtaButton, GhostButton, SectionLabel,
} from '../components/ui/kit';
import { currentEra } from '../data/eras';
import CommentaryPanel from '../components/CommentaryPanel';
import CupPanel from '../components/CupPanel';
import StandingsTable from '../components/StandingsTable';

// The season screen — direction 1b of the redesign ("Console MyGM"), the one
// the whole system was fixed from. Reading order is the point: who you are and
// how you're doing (hero) → the two numbers that constrain every decision
// (star + cap) → what the owner is measuring you against → what needs attention
// → and one red button that moves time forward.

interface SimulationScreenProps {
  season: SeasonState;
  isSimulating: boolean;
  onAdvance: (target: number) => void;
  isCommentaryLoading: boolean;
  commentaryInterval: number;
  /** Opens the 3D "Assistir ao Jogo" screen for the user's next fixture. */
  onWatchGame?: (opponent: Team, atHome: boolean) => void;
}

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

const ZONE_COLOR = { safe: COLORS.goodSoft, warm: COLORS.warn, hot: COLORS.badSoft } as const;

/** "Shai Gilgeous-Alexander" → "S. Gilgeous-Alexander", for tight tiles. */
const abbreviate = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0]) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
};

const SimulationScreen: React.FC<SimulationScreenProps> = ({
  season, isSimulating, onAdvance, isCommentaryLoading, commentaryInterval, onWatchGame,
}) => {
  const { accent } = useTheme();
  const userTeam = season.teams.find((t) => t.id === season.userTeamId);
  const gp = season.gamesPlayed;
  const remaining = Math.max(0, 82 - gp);
  const over = season.status !== 'active';
  const seasonNumber = season.gmLegacy.seasons + 1;
  // Derived from eraChainIndex, so it tracks where the save is now rather than
  // where it started — undefined for a live save, which keeps the eyebrow as
  // it always was.
  const era = currentEra(season.eraChainIndex);
  // Did this save just cross into a new era? Derived by comparing the current
  // chain position against the previous one, so it needs no stored flag and
  // can't be flushed the way a feed event can (the offseason pushes several
  // hundred events through a 60-slot buffer, so anything announced there is
  // long gone by the time the player lands here). Shown only before the first
  // game of the season, i.e. exactly when the player arrives from the
  // offseason.
  const previousEra = currentEra(season.eraChainIndex !== undefined ? season.eraChainIndex - 1 : undefined);
  // seasonNumber > 1 matters: a save STARTED on the first season of a group
  // (e.g. 1998-99, the first Kobe Era entry) would otherwise compare against
  // the group before it and claim the player crossed an era they never played.
  // Real NBA offseason moves replayed on the way into this season. Read from
  // state (only the ones that actually landed) rather than from data/eras, and
  // shown here because the events feed can't carry them — an offseason pushes
  // several hundred events through a 60-slot buffer that only ever renders its
  // top 6, so these were being generated and then buried, every single year.
  const offseasonMoves = season.gamesPlayed === 0 ? (season.lastOffseasonMoves ?? []) : [];
  const teamName = (id: string) => getTeamNickname(season.teams.find((t) => t.id === id));
  const justCrossedEra =
    seasonNumber > 1 && season.gamesPlayed === 0
    && !!era && !!previousEra && era.groupId !== previousEra.groupId;

  const salary = userTeam ? getTeamSalary(userTeam, season.players) : 0;
  // The salary model is synthetic and runs hot: 29 of the 30 teams sit above
  // the real cap (league median ~127%). A meter drawn against the cap is
  // therefore pinned to the top for everyone and says nothing, and an "over the
  // cap" warning color would fire permanently. So the bar tracks payroll
  // against the LEAGUE'S BIGGEST — which actually moves — and the cap
  // percentage stays underneath it as the plain fact it is.
  const leagueMaxSalary = Math.max(...season.teams.map((t) => getTeamSalary(t, season.players)), 1);
  const payrollShare = salary / leagueMaxSalary;
  const payrollRank = season.teams
    .map((t) => getTeamSalary(t, season.players))
    .filter((v) => v > salary).length + 1;

  const star = userTeam
    ? userTeam.roster.map((id) => season.players[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr)[0]
    : undefined;

  const form = userTeam ? recentForm(season.schedule, userTeam.id, 5) : [];
  const streak = userTeam ? currentStreak(season.schedule, userTeam.id) : 0;
  const fixture = userTeam ? nextGame(season.schedule, userTeam.id) : null;
  const opponent = fixture
    ? season.teams.find((t) => t.id === (fixture.homeTeamId === season.userTeamId ? fixture.awayTeamId : fixture.homeTeamId))
    : undefined;
  const atHome = fixture?.homeTeamId === season.userTeamId;
  const winPct = userTeam && opponent ? winProbability(userTeam, opponent, season.players, !!atHome) : 0.5;

  const zone = confidenceZone(season.owner.confidence);
  const zoneColor = ZONE_COLOR[zone];
  const mandate = MANDATE_META[season.owner.mandate];
  const wins = userTeam?.wins ?? 0;
  const losses = userTeam?.losses ?? 0;
  const injuredCount = Object.keys(userTeam?.playerAbsences ?? {}).length;
  const offerCount = season.tradeOffers?.length ?? 0;

  // Pace against the owner's win target, capped at 100% — the second meter in
  // the "metas" panel is the same number the owner judges you on at season end.
  const paceWins = gp > 0 ? (wins / gp) * 82 : 0;
  const targetProgress = season.owner.targetWins > 0 ? Math.min(1, paceWins / season.owner.targetWins) : 0;

  const busy = isSimulating || over;

  const quickSim = (
    <View className="flex-row" style={{ gap: 8, marginBottom: 9 }}>
      <GhostButton label="+1 dia" onPress={() => onAdvance(gp + 1)} disabled={busy} padding={9} size={10.5} style={{ flex: 1 }} />
      <GhostButton label="+7 dias" onPress={() => onAdvance(Math.min(82, gp + 7))} disabled={busy} padding={9} size={10.5} style={{ flex: 1 }} />
      <GhostButton label="Metade" onPress={() => onAdvance(41)} disabled={busy || gp >= 41} padding={9} size={10.5} style={{ flex: 1 }} />
    </View>
  );

  return (
    <Screen
      heroHeight={330}
      footer={
        <View>
          {quickSim}
          <CtaButton
            label={isSimulating ? 'Simulando…' : 'Avançar temporada'}
            sub={over ? 'Temporada regular encerrada' : `${remaining} ${remaining === 1 ? 'jogo restante' : 'jogos restantes'}`}
            onPress={() => onAdvance(82)}
            disabled={busy}
          />
        </View>
      }
    >
      {/* ---------------------------------------------------------------- hero */}
      <HeroContent>
        <View className="flex-row items-center justify-between">
          <Eyebrow>GM · Temporada {seasonNumber}{era ? ` · ${era.label}` : ''}</Eyebrow>
          <View
            className="flex-row items-center"
            style={{ gap: 6, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.pill }}
          >
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: zoneColor }} />
            <MonoLabel size={9.5} color={zoneColor} style={{ letterSpacing: 0.5 }}>
              Dono: {ZONE_META[zone].label}
            </MonoLabel>
          </View>
        </View>

        <View className="flex-row items-center" style={{ gap: 14, marginTop: 14 }}>
          <Image
            source={{ uri: getTeamLogoUrl(userTeam) }}
            style={{ width: 66, height: 66 }}
            contentFit="contain"
          />
          <View className="flex-1">
            <HeroTitle size={30} numberOfLines={1} adjustsFontSizeToFit>
              {getTeamNickname(userTeam)}
            </HeroTitle>
            <MonoLabel size={10.5} color="rgba(255,255,255,0.7)" style={{ marginTop: 4, letterSpacing: 0.5 }} numberOfLines={1}>
              {getTeamCity(userTeam)} · {conferenceLabel(userTeam)}
            </MonoLabel>
          </View>
        </View>

        <View className="flex-row items-end" style={{ gap: 16, marginTop: 18 }}>
          <View>
            <Stat size={44} style={{ lineHeight: 42 }}>{wins}-{losses}</Stat>
            <MonoLabel size={10} color="rgba(255,255,255,0.6)" style={{ marginTop: 5 }}>Campanha</MonoLabel>
          </View>
          {/* Last five, oldest → newest. Empty slots before the season starts. */}
          <View className="flex-1 flex-row justify-end" style={{ gap: 5, paddingBottom: 8 }}>
            {form.map((r, i) => (
              <View
                key={i}
                style={{
                  width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: r.won ? COLORS.good : COLORS.cta,
                }}
              >
                <Text className="font-mono-bold" style={{ fontSize: 10, color: r.won ? '#04210f' : '#2a0603' }}>
                  {r.won ? 'V' : 'D'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Where the season is, at a glance — the progress bar the old screen
            devoted a whole card to, folded into the hero. */}
        <View style={{ marginTop: 16 }}>
          <View className="flex-row justify-between" style={{ marginBottom: 5 }}>
            <MonoLabel size={9} color="rgba(255,255,255,0.6)">Jogo {gp} de 82</MonoLabel>
            <MonoLabel size={9} color="rgba(255,255,255,0.6)">{Math.round((gp / 82) * 100)}%</MonoLabel>
          </View>
          <Meter value={gp / 82} height={6} track="rgba(0,0,0,0.35)" colors={[accent.primary, accent.secondary]} />
        </View>
      </HeroContent>

      {/* ---------------------------------------------------------------- body */}
      <Body top={20}>
        {justCrossedEra && era ? (
          <Panel bar={COLORS.cta} padding={14} style={{ marginBottom: 10 }}>
            <MonoLabel>Nova era</MonoLabel>
            <Text className="font-bold text-white" style={{ fontSize: 15, marginTop: 6 }}>
              Começa a {era.label}
            </Text>
            <Text style={{ fontSize: 11.5, lineHeight: 16, color: INK.body, marginTop: 5 }}>
              {era.seasonLabel
                ? `Sua carreira atravessou da ${previousEra?.label} para a ${era.label}. A liga entra em ${era.seasonLabel}, com os elencos reais daquela temporada.`
                : `A história real acaba aqui. Daqui pra frente é a ${era.label}, e a liga segue só pelo que você fizer dela.`}
            </Text>
          </Panel>
        ) : null}
        {offseasonMoves.length > 0 ? (
          <Panel padding={14} style={{ marginBottom: 10 }}>
            <MonoLabel>Offseason real · {offseasonMoves.length} movimentações</MonoLabel>
            <Text style={{ fontSize: 11, lineHeight: 15, color: INK.body, marginTop: 5, marginBottom: 9 }}>
              O que de fato aconteceu na NBA entre uma temporada e outra, replicado no seu save.
            </Text>
            <View style={{ gap: 7 }}>
              {offseasonMoves.slice(0, 8).map((m, i) => (
                <View key={i} className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="font-semibold text-white" style={{ fontSize: 11.5, flex: 1 }} numberOfLines={1}>
                    {m.playerName}
                  </Text>
                  <Text className="font-mono" style={{ fontSize: 10, color: COLORS.textSoft }} numberOfLines={1}>
                    {teamName(m.fromTeamId)} › {teamName(m.toTeamId)}
                  </Text>
                </View>
              ))}
            </View>
            {offseasonMoves.length > 8 ? (
              <Text style={{ fontSize: 10.5, color: COLORS.textSoft, marginTop: 9 }}>
                e mais {offseasonMoves.length - 8} pela liga.
              </Text>
            ) : null}
          </Panel>
        ) : null}
        {/* Star + cap: the two constraints every decision on every other screen
            runs into. */}
        <View className="flex-row" style={{ gap: 10 }}>
          <Panel bar={COLORS.cta} className="flex-1">
            <MonoLabel>Estrela</MonoLabel>
            {/* Abbreviated rather than truncated: "Shai Gilgeous-Alexa…" tells
                you less than "S. Gilgeous-Alexander" in the same width. */}
            <Text className="font-bold text-white" style={{ fontSize: 14, marginTop: 5 }} numberOfLines={1}>
              {star ? abbreviate(star.name) : '—'}
            </Text>
            <View className="flex-row items-baseline" style={{ gap: 6, marginTop: 4 }}>
              <Stat size={22} color={star ? attributeColor(star.ovr) : COLORS.neutral}>{star?.ovr ?? '—'}</Stat>
              <Text className="font-semibold" style={{ fontSize: 10, color: INK.body }}>OVR · {star?.pos ?? '—'}</Text>
            </View>
          </Panel>

          <Panel bar={COLORS.warn} className="flex-1">
            <MonoLabel>Folha salarial</MonoLabel>
            <Stat size={14} style={{ marginTop: 5 }} fit>{money(salary)}</Stat>
            <Meter
              value={payrollShare}
              height={5}
              colors={[accent.primary, accent.secondary]}
              style={{ marginTop: 9 }}
            />
            <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 5, letterSpacing: 0 }}>
              {payrollRank}ª maior · {Math.round((salary / SALARY_CAP) * 100)}% do teto
            </MonoLabel>
          </Panel>
        </View>

        {/* What the owner is actually measuring. */}
        <Panel padding={14}>
          <MonoLabel size={9} style={{ marginBottom: 11 }}>Metas da diretoria</MonoLabel>
          <View style={{ gap: 11 }}>
            {/* Before a game is played there is no pace to judge, so the bar
                stays neutral — scoring it red on day one reads as a warning
                about something that hasn't happened yet. */}
            <GoalRow
              label={mandate.label}
              value={targetProgress}
              display={gp === 0 ? `meta ${season.owner.targetWins} V` : `${Math.round(paceWins)}/${season.owner.targetWins} V`}
              color={
                gp === 0
                  ? COLORS.neutral
                  : targetProgress >= 0.95 ? COLORS.good : targetProgress >= 0.7 ? COLORS.warn : COLORS.cta
              }
            />
            <GoalRow
              label="Confiança do dono"
              value={season.owner.confidence / 100}
              display={`${season.owner.confidence}%`}
              color={zoneColor}
            />
          </View>
          {season.owner.note ? (
            <Text style={{ fontSize: 11, lineHeight: 16, color: INK.body, marginTop: 11 }}>{season.owner.note}</Text>
          ) : null}
        </Panel>

        {/* Everything that wants a decision, as one scannable row. */}
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {streak !== 0 ? (
            <Chip tone={streak > 0 ? 'good' : 'bad'}>
              {streak > 0 ? `🔥 ${streak} seguidas` : `${-streak} derrotas seguidas`}
            </Chip>
          ) : null}
          {offerCount > 0 ? <Chip tone="info">{offerCount} {offerCount === 1 ? 'oferta de troca' : 'ofertas de troca'}</Chip> : null}
          {injuredCount > 0 ? <Chip tone="bad">{injuredCount} {injuredCount === 1 ? 'lesionado' : 'lesionados'}</Chip> : null}
          {streak === 0 && offerCount === 0 && injuredCount === 0 ? (
            <Chip tone="neutral">Nada exigindo atenção</Chip>
          ) : null}
        </View>

        {/* Next fixture. */}
        {opponent && fixture ? (
          <Panel padding={14}>
            <View className="flex-row justify-between items-center" style={{ marginBottom: 11 }}>
              <MonoLabel size={9}>Próximo jogo</MonoLabel>
              <MonoLabel size={9.5} color={INK.faint} style={{ letterSpacing: 0 }}>
                Dia {fixture.day} · {atHome ? 'Casa' : 'Fora'}
              </MonoLabel>
            </View>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <Image source={{ uri: getTeamLogoUrl(userTeam) }} style={{ width: 34, height: 34 }} contentFit="contain" />
              <View className="flex-1">
                <View className="flex-row justify-between" style={{ marginBottom: 5 }}>
                  <Stat size={10} color={accent.primary}>{Math.round(winPct * 100)}%</Stat>
                  <Stat size={10} color="rgba(255,255,255,0.5)">{100 - Math.round(winPct * 100)}%</Stat>
                </View>
                <View style={{ height: 5, borderRadius: RADIUS.pill, backgroundColor: COLORS.cta, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round(winPct * 100)}%`, height: '100%', backgroundColor: accent.primary }} />
                </View>
              </View>
              <Image source={{ uri: getTeamLogoUrl(opponent) }} style={{ width: 34, height: 34 }} contentFit="contain" />
            </View>
            <MonoLabel size={9} color={INK.faint} style={{ marginTop: 9, letterSpacing: 0 }}>
              Projeção pela força das rotações
            </MonoLabel>
            {onWatchGame ? (
              <GhostButton
                label="Assistir ao jogo"
                onPress={() => onWatchGame(opponent, !!atHome)}
                disabled={busy}
                color={accent.primary}
                padding={11}
                style={{ marginTop: 11 }}
              />
            ) : null}
          </Panel>
        ) : null}

        {/* League chatter. */}
        {season.events.length > 0 ? (
          <Panel padding={14}>
            <MonoLabel size={9} style={{ marginBottom: 10 }}>Na liga</MonoLabel>
            <View style={{ gap: 9 }}>
              {season.events.slice(0, 6).map((e, i) => (
                <View key={i} className="flex-row" style={{ gap: 9 }}>
                  <View
                    style={{
                      width: 5, height: 5, borderRadius: 3, marginTop: 6,
                      backgroundColor:
                        e.type === 'injury' ? COLORS.warn : e.type === 'trade' ? COLORS.info : COLORS.goodSoft,
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 16, color: COLORS.textSoft }}>{e.message}</Text>
                </View>
              ))}
            </View>
          </Panel>
        ) : null}

        <CommentaryPanel
          commentary={season.leagueCommentary}
          isLoading={isCommentaryLoading}
          interval={commentaryInterval}
        />

        <CupPanel cup={season.cup} teams={season.teams} />

        <SectionLabel>Classificação</SectionLabel>
        <Panel padding={13}>
          <MonoLabel size={9} color={COLORS.info} style={{ marginBottom: 8 }}>Leste</MonoLabel>
          <StandingsTable teams={season.teams} conference="East" schedule={season.schedule} userTeamId={season.userTeamId} limit={8} />
        </Panel>
        <Panel padding={13}>
          <MonoLabel size={9} color={COLORS.badSoft} style={{ marginBottom: 8 }}>Oeste</MonoLabel>
          <StandingsTable teams={season.teams} conference="West" schedule={season.schedule} userTeamId={season.userTeamId} limit={8} />
        </Panel>
      </Body>
    </Screen>
  );
};

// One labelled meter in the owner-goals panel.
const GoalRow: React.FC<{ label: string; value: number; display: string; color: string }> = ({
  label, value, display, color,
}) => (
  <View>
    <View className="flex-row justify-between items-baseline" style={{ marginBottom: 5 }}>
      <Text className="font-semibold" style={{ fontSize: 11, color: COLORS.textSoft, flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <Stat size={11} color={color}>{display}</Stat>
    </View>
    <Meter value={value} color={color} height={6} />
  </View>
);

export default SimulationScreen;
