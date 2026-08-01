import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { Team, Player, Coach } from '../types';
import {
  getTeamLogoUrl, getTeamSalary, SALARY_CAP, getTeamTitles, coachOf,
  getTeamNickname, getTeamCity, conferenceLabel, attributeColor,
} from '../constants';
import { teamRating } from '../services/formService';
import { COLORS, INK } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, HeroTitle, StatTile, SectionLabel } from '../components/ui/kit';
import RosterRow from '../components/ui/RosterRow';
import PickAssets from '../components/PickAssets';
import CoachPanel from '../components/CoachPanel';

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// Browsing a rival. Deliberately keeps the USER's accent on the hero band
// rather than the viewed team's: the chrome belongs to your franchise, and the
// team you're scouting is identified by its logo and name, not by repainting
// the whole app in its colors mid-save.
const TeamDetail: React.FC<{
  team: Team;
  players: { [key: string]: Player };
  // Needed to project where this team's picks would land — the whole point of
  // scouting a rival's draft capital before opening trade talks.
  teams: Team[];
  coaches: { [key: string]: Coach };
  currentDraft: number;
  onBack: () => void;
}> = ({ team, players, teams, coaches, currentDraft, onBack }) => {
  const salary = getTeamSalary(team, players);
  const capSpace = SALARY_CAP - salary;
  const roster = team.roster.map((pId) => players[pId]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const titles = getTeamTitles(team.id);
  const coach = coachOf(team, coaches);
  const absences = team.playerAbsences ?? {};

  return (
    <Screen heroHeight={186}>
      <HeroContent>
        <Pressable onPress={onBack} hitSlop={12} className="active:opacity-60">
          <Eyebrow size={9.5}>‹ Franquias</Eyebrow>
        </Pressable>

        <View className="flex-row items-center" style={{ gap: 13, marginTop: 14 }}>
          <Image
            source={{ uri: getTeamLogoUrl(team) }}
            placeholder={{ uri: NBA_FALLBACK }}
            style={{ width: 56, height: 56 }}
            contentFit="contain"
          />
          <View style={{ flex: 1 }}>
            <HeroTitle size={26} numberOfLines={1} adjustsFontSizeToFit>{getTeamNickname(team)}</HeroTitle>
            <MonoLabel size={10} color="rgba(255,255,255,0.7)" style={{ marginTop: 4, letterSpacing: 0.4 }} numberOfLines={1}>
              {getTeamCity(team)} · {conferenceLabel(team)} · {titles} {titles === 1 ? 'título' : 'títulos'}
            </MonoLabel>
            <MonoLabel size={10} color="rgba(255,255,255,0.55)" style={{ marginTop: 3, letterSpacing: 0.4 }} numberOfLines={1}>
              {team.wins ?? 0}-{team.losses ?? 0} · {coach?.name ?? 'Sem técnico'}
            </MonoLabel>
          </View>
        </View>
      </HeroContent>

      <Body top={16}>
        <View className="flex-row" style={{ gap: 10 }}>
          <StatTile
            label="Cap space"
            value={capSpace >= 0 ? money(capSpace) : `-${money(Math.abs(capSpace))}`}
            sub={money(salary)}
            color={capSpace >= 0 ? COLORS.goodSoft : COLORS.warn}
            bar={capSpace >= 0 ? COLORS.goodSoft : COLORS.warn}
          />
          <StatTile label="Elenco" value={roster.length} sub={`${Object.keys(absences).length} fora`} />
          <StatTile
            label="Força"
            value={teamRating(team, players)}
            color={attributeColor(teamRating(team, players))}
            bar={COLORS.info}
          />
        </View>

        <CoachPanel team={team} coaches={coaches} />

        <Panel padding={14}>
          <PickAssets team={team} teams={teams} currentDraft={currentDraft} />
        </Panel>

        <SectionLabel>Elenco · {roster.length}</SectionLabel>
        {roster.map((p) => {
          const absence = absences[p.id];
          return (
            <RosterRow
              key={p.id}
              player={p}
              out={!!absence}
              badge={absence ? `Fora ${absence.duration}` : p.pos}
              badgeTone={absence ? 'danger' : 'info'}
              meta={`${p.age}a · ${money(p.salary)} · ${p.contractYears} ${p.contractYears === 1 ? 'ano' : 'anos'}`}
            />
          );
        })}

        <Text style={{ fontSize: 10.5, lineHeight: 15, color: INK.faint, paddingHorizontal: 4 }}>
          Use a Central de Trocas para abrir conversa com o {getTeamNickname(team)}.
        </Text>
      </Body>
    </Screen>
  );
};

export default TeamDetail;
