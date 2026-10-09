import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { Team, Player, Coach, ScheduleGame } from '../types';
import {
  getTeamSalary, SALARY_CAP, getTeamTitles, getTeamNickname, getTeamCity, getTeamAccent, picksOf,
} from '../constants';
import { teamRating } from '../services/formService';
import { sortStandings } from '../services/scheduleService';
import { simulationEngine, DEFAULT_ROTATION_SIZE } from '../services/simulationService';
import { rivalryReason } from '../services/rivalryService';
import { COLORS, FONT, ovrColor, visibleTeamColor } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { Panel, TeamBadge, Tag, BodyText, Name, SectionLabel, CtaButton, Dock, Stat, MonoLabel, PlayerFace, TeamLogo, HeroTitle } from '../components/ui/kit';
import { useDesktop } from '../components/desktop/useDesktop';
import { DPage, DDock, DCta, BackLink, Hover, Cols, Col } from '../components/desktop/kit';
import CoachPanel from '../components/CoachPanel';
import StartersCourt from '../components/StartersCourt';
import PlayerDetailModal from '../components/PlayerDetailModal';
import PickAssets from '../components/PickAssets';

// Design 4c ("Transmissão"). Another franchise, read against yours: a mirrored
// comparison (your bar grows left in your color, theirs right in theirs), the
// three numbers that decide a trade conversation (cap room, picks, chemistry),
// their five on the floor, the roster — and "Abrir negociação" straight into
// the Trade Center with them already picked.

const money = (v: number) => `$${(Math.abs(v) / 1_000_000).toFixed(1)}M`;

/** The rotation's offense/defense/bench — the numbers the engine plays with. */
const profile = (team: Team, players: { [k: string]: Player }) => {
  const rot = simulationEngine.getTeamRotation(team, players, team.rotationSize ?? DEFAULT_ROTATION_SIZE).map((id) => players[id]).filter(Boolean);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  return {
    geral: teamRating(team, players),
    ataque: avg(rot.slice(0, 8).map((p) => p.off)),
    defesa: avg(rot.slice(0, 8).map((p) => p.def)),
    banco: avg(rot.slice(5, 10).map((p) => p.ovr)),
  };
};

const TeamDetail: React.FC<{
  team: Team;
  players: { [key: string]: Player };
  // Needed to project where this team's picks would land — the whole point of
  // scouting a rival's draft capital before opening trade talks.
  teams: Team[];
  coaches: { [key: string]: Coach };
  currentDraft: number;
  /** Your rivalry with this team, when it has become one. */
  rivalry?: { heat: number; why?: string; close?: number };
  /** Your own team, for the mirrored comparison. */
  userTeam?: Team;
  schedule?: ScheduleGame[];
  /** Opens the Trade Center with this team as partner; absent past the deadline. */
  onOpenTrade?: () => void;
  onBack: () => void;
}> = ({ team, players, teams, coaches, currentDraft, rivalry, userTeam, schedule = [], onOpenTrade, onBack }) => {
  const desktop = useDesktop();
  const salary = getTeamSalary(team, players);
  const capSpace = SALARY_CAP - salary;
  const roster = team.roster.map((pId) => players[pId]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const titles = getTeamTitles(team.id);
  const absences = team.playerAbsences ?? {};
  const [viewing, setViewing] = useState<Player | null>(null);
  const gamesIn = (team.wins ?? 0) + (team.losses ?? 0);
  const rank = gamesIn > 0
    ? sortStandings(teams.filter((t) => t.conference === team.conference), schedule).findIndex((t) => t.id === team.id) + 1
    : 0;
  const chemistry = Math.round(simulationEngine.teamChemistry(team, players));
  const mine = userTeam && userTeam.id !== team.id ? userTeam : undefined;
  const them = profile(team, players);
  const us = mine ? profile(mine, players) : undefined;
  const vis = (id: string) => { const a = getTeamAccent(id); return visibleTeamColor(a.primary, a.secondary); };
  const ourColor = mine ? vis(mine.id) : COLORS.dim;
  const theirColor = vis(team.id);

  const rows: { k: string; a: number; b: number }[] = us
    ? [
        { k: 'Geral', a: us.geral, b: them.geral },
        { k: 'Ataque', a: us.ataque, b: them.ataque },
        { k: 'Defesa', a: us.defesa, b: them.defesa },
        { k: 'Banco', a: us.banco, b: them.banco },
      ]
    : [];
  // Bars scaled between a floor and the best of the two, so a 2-point gap shows.
  const barW = (v: number, other: number) => {
    const lo = Math.min(v, other) - 6;
    const hi = Math.max(v, other);
    return `${Math.max(12, ((v - lo) / Math.max(1, hi - lo)) * 100)}%` as const;
  };

  const compareCard = mine && us ? (
    <Panel style={{ gap: 10 }}>
      <View className="flex-row justify-between">
        <MonoLabel size={9}>{mine.id.toUpperCase()}</MonoLabel>
        <MonoLabel size={9}>Comparação</MonoLabel>
        <MonoLabel size={9}>{team.id.toUpperCase()}</MonoLabel>
      </View>
      {rows.map((r) => (
        <View key={r.k} className="flex-row items-center" style={{ gap: 6 }}>
          <Text style={{ width: 30, fontFamily: FONT.cond800, fontSize: 17, color: COLORS.text }}>{r.a}</Text>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: COLORS.line, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <View style={{ height: '100%', borderRadius: 3, backgroundColor: ourColor, width: barW(r.a, r.b) }} />
          </View>
          <Text style={{ width: 64, textAlign: 'center', fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.3, color: COLORS.dim, textTransform: 'uppercase' }}>{r.k}</Text>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: COLORS.line }}>
            <View style={{ height: '100%', borderRadius: 3, backgroundColor: theirColor, width: barW(r.b, r.a) }} />
          </View>
          <Text style={{ width: 30, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 17, color: COLORS.text }}>{r.b}</Text>
        </View>
      ))}
    </Panel>
  ) : null;

  const tiles = (
    <View className="flex-row" style={{ gap: 8 }}>
      <Panel padding={12} radius={14} className="flex-1" style={{ gap: 3 }}>
        <MonoLabel size={9}>Espaço</MonoLabel>
        <Stat size={19} color={capSpace >= 0 ? COLORS.good : COLORS.warn} fit>{capSpace >= 0 ? money(capSpace) : `–${money(capSpace)}`}</Stat>
      </Panel>
      <Panel padding={12} radius={14} className="flex-1" style={{ gap: 3 }}>
        <MonoLabel size={9}>Picks 1ª</MonoLabel>
        <Stat size={19}>{picksOf(team).length}</Stat>
      </Panel>
      <Panel padding={12} radius={14} className="flex-1" style={{ gap: 3 }}>
        <MonoLabel size={9}>Química</MonoLabel>
        <Stat size={19} color={chemistry >= 70 ? COLORS.good : chemistry >= 45 ? COLORS.warn : COLORS.bad}>{chemistry}</Stat>
      </Panel>
    </View>
  );

  const rosterList = (
    <View>
      <SectionLabel>Elenco · {roster.length}</SectionLabel>
      <View style={{ marginTop: 4 }}>
        {roster.map((p) => {
          const absence = absences[p.id];
          return (
            <Hover
              key={p.id}
              onPress={() => setViewing(p)}
              hoverStyle={{ backgroundColor: COLORS.surface }}
              style={{ flexDirection: 'row', alignItems: 'center', height: desktop ? 50 : 44, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}
            >
              <Text style={{ width: 24, fontFamily: FONT.cond800, fontSize: 12, color: COLORS.dim }}>{p.pos}</Text>
              {desktop ? <PlayerFace player={p} size={32} style={{ borderRadius: 16 }} /> : null}
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Name size={desktop ? 16 : 15}>{p.name}</Name>
                <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 11.5, color: absence ? COLORS.bad : COLORS.dim }}>
                  {absence
                    ? `Fora ${absence.duration} jogos · ${absence.reason === 'injury' ? 'lesionado' : 'suspenso'}`
                    : `${p.age}a · $${(p.salary / 1_000_000).toFixed(1)}M · ${p.contractYears === 1 ? 'último ano' : `${p.contractYears} anos`}`}
                </Text>
              </View>
              <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 22 : 20, color: ovrColor(p.ovr) }}>{p.ovr}</Text>
            </Hover>
          );
        })}
      </View>
    </View>
  );

  const playerModal = viewing ? (
    <PlayerDetailModal
      player={viewing}
      teamId={team.id}
      onClose={() => setViewing(null)}
      status={absences[viewing.id] ? `Fora ${absences[viewing.id].duration} jogos · ${absences[viewing.id].reason === 'injury' ? 'lesionado' : 'suspenso'}` : undefined}
    />
  ) : null;

  // PC: header with a 72px badge, then two columns — the comparison, the
  // numbers and their five on the left; roster, staff and picks on the right.
  if (desktop) {
    return (
      <DPage footer={onOpenTrade ? <DDock note="Abre Trocas com este time já escolhido como parceiro."><DCta label="Abrir negociação" onPress={onOpenTrade} /></DDock> : undefined}>
        <BackLink onPress={onBack} label="Franquias" color={COLORS.muted} />
        <View className="flex-row items-center" style={{ gap: 18, marginTop: 14 }}>
          <TeamBadge teamId={team.id} width={72} height={72} />
          <TeamLogo teamId={team.id} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <HeroTitle size={44} numberOfLines={1}>{getTeamNickname(team)}</HeroTitle>
            <BodyText size={15} numberOfLines={1}>
              {getTeamCity(team)} · {team.wins ?? 0}–{team.losses ?? 0}{rank ? ` · ${rank}º ${team.conference === 'East' ? 'Leste' : 'Oeste'}` : ''} · {titles} {titles === 1 ? 'título' : 'títulos'}
              {rivalry ? ` · Rival: ${rivalryReason(rivalry)}` : team.tanking ? ' · Jogando pela loteria' : ''}
            </BodyText>
          </View>
          {rivalry ? <Tag color={COLORS.west}>Rival</Tag> : team.tanking ? <Tag color={COLORS.warn}>Loteria</Tag> : null}
        </View>
        <Cols style={{ marginTop: 24 }}>
          <Col>
            {compareCard}
            {tiles}
            <StartersCourt team={team} players={players} onPlayerPress={setViewing} />
          </Col>
          <Col>
            {rosterList}
            <CoachPanel team={team} coaches={coaches} />
            <Panel><PickAssets team={team} teams={teams} currentDraft={currentDraft} /></Panel>
          </Col>
        </Cols>
        {playerModal}
      </DPage>
    );
  }

  return (
    <Screen
      heroHeight={130}
      footer={onOpenTrade ? <Dock><CtaButton label="Abrir negociação" onPress={onOpenTrade} /></Dock> : undefined}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 14 }}>
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={12} className="active:opacity-60" style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.4, color: COLORS.muted }}>‹ FRANQUIAS</Text>
        </Pressable>
        <View className="flex-row items-center" style={{ gap: 14 }}>
          <TeamBadge teamId={team.id} width={62} height={62} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 32, lineHeight: 32, color: COLORS.text, textTransform: 'uppercase' }}>
              {getTeamNickname(team)}
            </Text>
            <BodyText size={13} numberOfLines={1}>
              {getTeamCity(team)} · {team.wins ?? 0}–{team.losses ?? 0}{rank ? ` · ${rank}º ${team.conference === 'East' ? 'Leste' : 'Oeste'}` : ''} · {titles} {titles === 1 ? 'título' : 'títulos'}
            </BodyText>
          </View>
          {rivalry ? <Tag color={COLORS.west}>Rival</Tag> : team.tanking ? <Tag color={COLORS.warn}>Loteria</Tag> : null}
        </View>
        {rivalry ? <BodyText size={12.5} color={COLORS.dim} style={{ marginTop: -6 }}>Rival · {rivalryReason(rivalry)}</BodyText> : null}
        {team.tanking ? <BodyText size={12.5} color={COLORS.dim} style={{ marginTop: -6 }}>Jogando pela loteria · titulares poupados</BodyText> : null}
      </View>

      <Body top={16} gap={14}>
        {compareCard}

        {tiles}

        {/* Their five, the way the sim will start them tonight. */}
        <StartersCourt team={team} players={players} onPlayerPress={setViewing} />

        {rosterList}

        <CoachPanel team={team} coaches={coaches} />

        <Panel>
          <PickAssets team={team} teams={teams} currentDraft={currentDraft} />
        </Panel>
      </Body>

      {playerModal}
    </Screen>
  );
};

export default TeamDetail;
