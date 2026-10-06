import React from 'react';
import { View, Text } from 'react-native';

import { SeasonState, Team } from '../types';
import { getTeamNickname, getTeamCity, conferenceLabel, getTeamAccent } from '../constants';
import { MANDATE_META, confidenceZone } from '../services/ownerService';
import { PROMISE_LABEL, PROMISE_KEPT, PROMISE_BROKEN } from '../services/pressService';
import { headlines } from '../services/headlineService';
import { isRival, rivalryReason, revengePlayers, REVENGE_BOOST, RIVAL_WIN_MORALE, RIVAL_LOSS_MORALE } from '../services/rivalryService';
import { currentStreak, nextGame, winProbability, teamResults } from '../services/formService';
import { sortStandings } from '../services/scheduleService';
import { COLORS, RADIUS, FONT, withAlpha, visibleTeamColor } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import {
  Panel, MonoLabel, Eyebrow, HeroTitle, Stat, Meter, CtaButton, GhostButton, SectionLabel,
  TeamBadge, Tag, Name, BodyText, Dock,
} from '../components/ui/kit';
import { currentEra } from '../data/eras';
import CupPanel from '../components/CupPanel';
import StandingsTable from '../components/StandingsTable';

// The season screen — design 1b of the "Transmissão" redesign. A TV
// scoreboard: who you are and the record, all 82 games as a strip, the next
// game with its stakes, the owner's two numbers, the front page — and a dock
// whose one light button moves time forward.

interface SimulationScreenProps {
  season: SeasonState;
  isSimulating: boolean;
  onAdvance: (target: number) => void;
  /** Opens the 3D "Assistir ao Jogo" screen for the user's next fixture. */
  onWatchGame?: (opponent: Team, atHome: boolean) => void;
}

const ZONE_COLOR = { safe: COLORS.good, warm: COLORS.warn, hot: COLORS.bad } as const;
const ZONE_PILL = { safe: 'Dono tranquilo', warm: 'Dono pressionando', hot: 'Dono na beira' } as const;

const HEADLINE_TONE: Record<'good' | 'warn' | 'bad' | 'info', string> = {
  good: COLORS.good, warn: COLORS.warn, bad: COLORS.bad, info: COLORS.gold,
};

/** "Jaren Jackson Jr." → "Jackson". */
const surname = (name: string) =>
  name.split(' ').filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).slice(-1)[0] ?? name;

const SimulationScreen: React.FC<SimulationScreenProps> = ({
  season, isSimulating, onAdvance, onWatchGame,
}) => {
  const userTeam = season.teams.find((t) => t.id === season.userTeamId);
  const gp = season.gamesPlayed;
  const remaining = Math.max(0, 82 - gp);
  const over = season.status !== 'active';
  const seasonNumber = season.gmLegacy.seasons + 1;
  // Derived from eraChainIndex, so it tracks where the save is now rather than
  // where it started — undefined for a live save.
  const era = currentEra(season.eraChainIndex);
  // Did this save just cross into a new era? Derived by comparing the current
  // chain position against the previous one, so it needs no stored flag and
  // can't be flushed the way a feed event can. Shown only before the first
  // game of the season, i.e. exactly when the player arrives from the
  // offseason. seasonNumber > 1: a save STARTED on the first season of a group
  // would otherwise claim the player crossed an era they never played.
  const previousEra = currentEra(season.eraChainIndex !== undefined ? season.eraChainIndex - 1 : undefined);
  const justCrossedEra =
    seasonNumber > 1 && season.gamesPlayed === 0
    && !!era && !!previousEra && era.groupId !== previousEra.groupId;
  // Real NBA offseason moves replayed on the way into this season (era saves
  // only). Read from state, shown here because the events feed can't carry them.
  const offseasonMoves = season.gamesPlayed === 0 ? (season.lastOffseasonMoves ?? []) : [];
  // Retirements worth naming: anyone who still mattered, and any of yours.
  const retirements = season.gamesPlayed === 0
    ? (season.lastRetirements ?? []).filter((r) => r.ovr >= 74 || r.teamId === season.userTeamId)
    : [];

  const streak = userTeam ? currentStreak(season.schedule, userTeam.id) : 0;
  const fixture = userTeam ? nextGame(season.schedule, userTeam.id) : null;
  const opponent = fixture
    ? season.teams.find((t) => t.id === (fixture.homeTeamId === season.userTeamId ? fixture.awayTeamId : fixture.homeTeamId))
    : undefined;
  const atHome = fixture?.homeTeamId === season.userTeamId;
  const winPct = userTeam && opponent ? winProbability(userTeam, opponent, season.players, !!atHome) : 0.5;
  // What makes the next game more than a game: a rival, or someone facing the
  // team he left.
  const front = headlines(season);
  const rival = opponent && isRival(season.rivalries, opponent.id) ? season.rivalries![opponent.id] : undefined;
  const revenge = userTeam && opponent ? revengePlayers(season, userTeam, opponent).slice(0, 2) : [];

  const zone = confidenceZone(season.owner.confidence);
  const zoneColor = ZONE_COLOR[zone];
  const mandate = MANDATE_META[season.owner.mandate];
  const wins = userTeam?.wins ?? 0;
  const losses = userTeam?.losses ?? 0;
  const injuredCount = Object.keys(userTeam?.playerAbsences ?? {}).length;
  const offerCount = season.tradeOffers?.length ?? 0;

  // Pace against the owner's win target, capped at 100% — the same number the
  // owner judges you on at season end.
  const paceWins = gp > 0 ? (wins / gp) * 82 : 0;
  const targetProgress = season.owner.targetWins > 0 ? Math.min(1, paceWins / season.owner.targetWins) : 0;

  const busy = isSimulating || over;

  // The season year: an era save reads it off the era chain; the live save
  // started in 2025-26 and moves one year per season.
  const yearLabel = era?.seasonLabel ?? (() => {
    const y = 2025 + seasonNumber - 1;
    return `${y}-${String(y + 1).slice(-2)}`;
  })();
  const conf = userTeam
    ? sortStandings(season.teams.filter((t) => t.conference === userTeam.conference), season.schedule)
    : [];
  const confRank = userTeam ? conf.findIndex((t) => t.id === userTeam.id) + 1 : 0;
  // Every one of the user's 82 games, in order: won / lost / still to play.
  const results = userTeam ? teamResults(season.schedule, userTeam.id) : [];
  const strip: ('w' | 'l' | 'n')[] = Array.from({ length: 82 }, (_, i) =>
    i < results.length ? (results[i].won ? 'w' : 'l') : 'n');

  return (
    <Screen
      heroHeight={260}
      stickyHeader={
        <View className="flex-row items-center" style={{ gap: 10 }}>
          {userTeam ? <TeamBadge teamId={userTeam.id} width={34} height={22} /> : null}
          <Name size={17}>{getTeamNickname(userTeam)}</Name>
          <Stat size={15}>{wins}–{losses}</Stat>
          <View className="flex-1" />
          <MonoLabel size={9.5} color={COLORS.muted}>Jogo {gp}/82</MonoLabel>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: zoneColor }} />
        </View>
      }
      footer={
        <Dock>
          <View className="flex-row" style={{ gap: 8 }}>
            <GhostButton filled label="+1 dia" onPress={() => onAdvance(gp + 1)} disabled={busy} style={{ flex: 1 }} />
            <GhostButton filled label="+7 dias" onPress={() => onAdvance(Math.min(82, gp + 7))} disabled={busy} style={{ flex: 1 }} />
            <GhostButton filled label={gp < 41 ? 'Metade' : 'Até o fim'} onPress={() => onAdvance(gp < 41 ? 41 : 82)} disabled={busy} style={{ flex: 1 }} />
          </View>
          <CtaButton
            label={isSimulating ? 'Simulando…' : over ? 'Temporada encerrada' : 'Simular temporada'}
            sub={over ? undefined : `${remaining} ${remaining === 1 ? 'jogo' : 'jogos'}`}
            onPress={() => onAdvance(82)}
            disabled={busy}
          />
        </Dock>
      }
    >
      {/* --------------------------------------------------------- scoreboard */}
      <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 16 }}>
        <View className="flex-row items-center justify-between">
          <Eyebrow size={12}>Temporada {seasonNumber} · {yearLabel}</Eyebrow>
          <View
            className="flex-row items-center"
            style={{ gap: 6, borderWidth: 1, borderColor: withAlpha(zoneColor, 0.35), paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: zoneColor }} />
            <MonoLabel size={10} color={zoneColor}>{ZONE_PILL[zone]}</MonoLabel>
          </View>
        </View>

        <View className="flex-row items-end" style={{ gap: 14 }}>
          {userTeam ? <TeamBadge teamId={userTeam.id} width={62} height={62} /> : null}
          <View className="flex-1" style={{ gap: 3 }}>
            <HeroTitle size={30} numberOfLines={1} adjustsFontSizeToFit>{getTeamNickname(userTeam)}</HeroTitle>
            <BodyText size={13} numberOfLines={1}>
              {gp > 0
                ? `${confRank}º no ${userTeam?.conference === 'East' ? 'Leste' : 'Oeste'}`
                : `${getTeamCity(userTeam)} · ${conferenceLabel(userTeam)}`}
              {streak !== 0 ? (
                <Text style={{ fontFamily: FONT.body600, color: streak > 0 ? COLORS.good : COLORS.bad }}>
                  {' · '}{Math.abs(streak)} {streak > 0 ? (streak === 1 ? 'vitória' : 'vitórias seguidas') : (streak === -1 ? 'derrota' : 'derrotas seguidas')}
                </Text>
              ) : null}
            </BodyText>
          </View>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 58, lineHeight: 52, color: COLORS.text, fontVariant: ['tabular-nums'] }}>
            {wins}–{losses}
          </Text>
        </View>

        {/* All 82 games: two rows of 41, green won / red lost / dark to play. */}
        <View style={{ gap: 7 }}>
          <View className="flex-row justify-between">
            <MonoLabel size={9}>Jogo {gp} de 82</MonoLabel>
            <MonoLabel size={9}>{remaining} restantes</MonoLabel>
          </View>
          <View style={{ gap: 2 }}>
            {[0, 1].map((row) => (
              <View key={row} className="flex-row" style={{ gap: 2 }}>
                {strip.slice(row * 41, row * 41 + 41).map((r, i) => (
                  <View
                    key={i}
                    style={{ flex: 1, height: 13, borderRadius: 2, backgroundColor: r === 'w' ? COLORS.good : r === 'l' ? COLORS.bad : COLORS.line }}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      <Body top={16} gap={14}>
        {justCrossedEra && era ? (
          <Panel bar={COLORS.gold}>
            <SectionLabel color={COLORS.gold}>Nova era</SectionLabel>
            <Name size={18} style={{ marginTop: 6 }}>Começa a {era.label}</Name>
            <BodyText style={{ marginTop: 4 }}>
              {era.seasonLabel
                ? `Sua carreira atravessou da ${previousEra?.label} para a ${era.label}. A liga entra em ${era.seasonLabel}, com os elencos reais daquela temporada.`
                : `A história real acaba aqui. Daqui pra frente é a ${era.label}, e a liga segue só pelo que você fizer dela.`}
            </BodyText>
          </Panel>
        ) : null}

        {/* ------------------------------------------------------- next game */}
        {opponent && fixture && userTeam ? (
          <Panel padding={16} radius={18} style={{ gap: 12 }}>
            <View className="flex-row justify-between">
              <MonoLabel size={9}>Próximo jogo</MonoLabel>
              <MonoLabel size={9}>Dia {fixture.day} · {atHome ? 'Em casa' : 'Fora'}</MonoLabel>
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <TeamBadge teamId={userTeam.id} width={44} height={44} />
                <Text style={{ fontFamily: FONT.cond700, fontSize: 15, color: COLORS.textSoft }}>{wins}–{losses}</Text>
              </View>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 13, letterSpacing: 2.6, color: COLORS.faint }}>VS</Text>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 15, color: COLORS.textSoft }}>
                  {opponent.wins ?? 0}–{opponent.losses ?? 0}
                </Text>
                <TeamBadge teamId={opponent.id} width={44} height={44} />
              </View>
            </View>
            <View style={{ gap: 5 }}>
              <View className="flex-row" style={{ height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
                <View style={{ width: `${Math.round(winPct * 100)}%`, backgroundColor: visibleTeamColor(getTeamAccent(userTeam.id).primary, getTeamAccent(userTeam.id).secondary) }} />
                <View style={{ flex: 1, backgroundColor: visibleTeamColor(getTeamAccent(opponent.id).primary, getTeamAccent(opponent.id).secondary) }} />
              </View>
              <View className="flex-row justify-between items-center">
                <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: COLORS.text }}>{Math.round(winPct * 100)}%</Text>
                <MonoLabel size={8.5} color={COLORS.faint}>Chance de vitória</MonoLabel>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: COLORS.muted }}>{100 - Math.round(winPct * 100)}%</Text>
              </View>
            </View>
            {rival || revenge.length ? (
              <View style={{ gap: 8 }}>
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                  {rival ? <Tag color={COLORS.west}>Rival · {rivalryReason(rival)}</Tag> : null}
                  {revenge.map((p) => (
                    <Tag key={p.id} color={COLORS.textSoft}>{surname(p.name)} volta · +{REVENGE_BOOST}</Tag>
                  ))}
                </View>
                {rival ? (
                  <BodyText size={12} color={COLORS.dim}>
                    Vencer o rival dá ânimo (+{RIVAL_WIN_MORALE}) e embalo; perder pesa ({RIVAL_LOSS_MORALE}).
                  </BodyText>
                ) : null}
              </View>
            ) : null}
            {onWatchGame ? (
              <GhostButton label="Assistir ao jogo" onPress={() => onWatchGame(opponent, !!atHome)} disabled={busy} />
            ) : null}
          </Panel>
        ) : null}

        {/* -------------------------------------------------- the owner's bar */}
        <View className="flex-row" style={{ gap: 8 }}>
          <Panel padding={13} className="flex-1" style={{ gap: 7 }}>
            <MonoLabel size={9}>Meta · {season.owner.targetWins} V</MonoLabel>
            <Stat size={22} fit>{gp === 0 ? mandate.label : `Ritmo ${Math.round(paceWins)}`}</Stat>
            <Meter
              value={gp === 0 ? 0 : targetProgress}
              height={5}
              color={gp === 0 ? COLORS.neutral : targetProgress >= 0.95 ? COLORS.good : targetProgress >= 0.7 ? COLORS.warn : COLORS.bad}
            />
          </Panel>
          <Panel padding={13} className="flex-1" style={{ gap: 7 }}>
            <MonoLabel size={9}>Confiança do dono</MonoLabel>
            <Stat size={22}>{season.owner.confidence}%</Stat>
            <Meter value={season.owner.confidence / 100} height={5} color={zoneColor} />
          </Panel>
        </View>

        {season.owner.note || season.owner.press?.promise || offerCount > 0 || injuredCount > 0 ? (
          <Panel style={{ gap: 9 }}>
            {season.owner.note ? <BodyText>{season.owner.note}</BodyText> : null}
            {/* The one thing said at a press conference that outlives it. */}
            {season.owner.press?.promise ? (
              <View className="flex-row" style={{ gap: 10 }}>
                <MonoLabel size={9} color={COLORS.warn}>Promessa</MonoLabel>
                <BodyText size={12.5} style={{ flex: 1 }}>
                  Na coletiva do dia {season.owner.press.promise.day}, você prometeu {PROMISE_LABEL[season.owner.press.promise.kind]}.
                  {' '}Cumprida: +{PROMISE_KEPT} de confiança no fim; quebrada: {PROMISE_BROKEN}.
                </BodyText>
              </View>
            ) : null}
            {offerCount > 0 || injuredCount > 0 ? (
              <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                {offerCount > 0 ? <Tag color={COLORS.east}>{offerCount} {offerCount === 1 ? 'oferta de troca' : 'ofertas de troca'}</Tag> : null}
                {injuredCount > 0 ? <Tag color={COLORS.bad}>{injuredCount} {injuredCount === 1 ? 'lesionado' : 'lesionados'}</Tag> : null}
              </View>
            ) : null}
          </Panel>
        ) : null}

        {/* ------------------------------------------------------ headlines */}
        {front.length > 0 ? (
          <Panel padding={0}>
            {front.map((h, i) => (
              <View
                key={h.id}
                style={{ gap: 2, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.lineSoft }}
              >
                <MonoLabel size={9} color={HEADLINE_TONE[h.tone]} numberOfLines={1}>{h.kicker}</MonoLabel>
                <View>
                  <Text style={{ fontFamily: FONT.body600, fontSize: 14, lineHeight: 19, color: COLORS.text }}>{h.title}</Text>
                  {h.sub ? <BodyText size={12} color={COLORS.dim} style={{ marginTop: 1 }}>{h.sub}</BodyText> : null}
                </View>
              </View>
            ))}
          </Panel>
        ) : null}

        {offseasonMoves.length > 0 ? (
          <Panel>
            <SectionLabel>Offseason real · {offseasonMoves.length} movimentações</SectionLabel>
            <View style={{ gap: 7, marginTop: 9 }}>
              {offseasonMoves.slice(0, 8).map((m, i) => (
                <View key={i} className="flex-row items-center" style={{ gap: 8 }}>
                  <Name size={14} style={{ flex: 1 }}>{m.playerName}</Name>
                  <TeamBadge teamId={m.fromTeamId} />
                  <Text style={{ color: COLORS.dim }}>›</Text>
                  <TeamBadge teamId={m.toTeamId} />
                </View>
              ))}
            </View>
            {offseasonMoves.length > 8 ? (
              <BodyText size={12} color={COLORS.dim} style={{ marginTop: 8 }}>e mais {offseasonMoves.length - 8} pela liga.</BodyText>
            ) : null}
          </Panel>
        ) : null}

        {retirements.length > 0 ? (
          <Panel>
            <SectionLabel>Aposentadorias · {retirements.length}</SectionLabel>
            <View style={{ gap: 7, marginTop: 9 }}>
              {retirements.slice(0, 6).map((r) => (
                <View key={r.playerId} className="flex-row items-center" style={{ gap: 8 }}>
                  <Name size={14} style={{ flex: 1 }}>{r.name}</Name>
                  <BodyText size={12} color={r.teamId === season.userTeamId ? COLORS.warn : COLORS.dim}>{r.age} anos · {r.ovr}</BodyText>
                  {r.teamId ? <TeamBadge teamId={r.teamId} /> : null}
                </View>
              ))}
            </View>
            {retirements.length > 6 ? (
              <BodyText size={12} color={COLORS.dim} style={{ marginTop: 8 }}>e mais {retirements.length - 6}.</BodyText>
            ) : null}
          </Panel>
        ) : null}

        {/* --------------------------------------------------- league chatter */}
        {season.events.length > 0 ? (
          <Panel>
            <SectionLabel>Na liga</SectionLabel>
            <View style={{ gap: 9, marginTop: 9 }}>
              {season.events.slice(0, 6).map((e, i) => (
                <View key={i} className="flex-row" style={{ gap: 9 }}>
                  <View
                    style={{
                      width: 3, borderRadius: 2,
                      backgroundColor: e.type === 'injury' ? COLORS.warn : e.type === 'trade' ? COLORS.east : COLORS.good,
                    }}
                  />
                  <BodyText size={12.5} color={COLORS.textSoft} style={{ flex: 1 }}>{e.message}</BodyText>
                </View>
              ))}
            </View>
          </Panel>
        ) : null}

        <CupPanel cup={season.cup} teams={season.teams} />

        <SectionLabel>Classificação</SectionLabel>
        <Panel padding={13}>
          <MonoLabel size={9} color={COLORS.west} style={{ marginBottom: 8 }}>Oeste</MonoLabel>
          <StandingsTable teams={season.teams} conference="West" schedule={season.schedule} userTeamId={season.userTeamId} limit={8} />
        </Panel>
        <Panel padding={13}>
          <MonoLabel size={9} color={COLORS.east} style={{ marginBottom: 8 }}>Leste</MonoLabel>
          <StandingsTable teams={season.teams} conference="East" schedule={season.schedule} userTeamId={season.userTeamId} limit={8} />
        </Panel>
      </Body>
    </Screen>
  );
};

export default SimulationScreen;
