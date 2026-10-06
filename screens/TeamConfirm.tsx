import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Team, Player } from '../types';
import {
  getTeamNickname, getTeamCity, TEAM_TITLES, getTeamSalary, SALARY_CAP, getTeamAccent,
} from '../constants';
import { buildSeasonOwner, MANDATE_META } from '../services/ownerService';
import { PICK_WINDOW } from '../services/draftService';
import { teamRating } from '../services/formService';
import { COLORS, FONT, withAlpha, onAccent, ovrColor } from '../src/theme/tokens';
import Screen, { HeroBackdrop, Body } from '../components/ui/Screen';
import { Panel, CtaButton, StatStrip, SectionLabel, BodyText, Name, Dock, TeamLogo } from '../components/ui/kit';

// Design 2c ("Transmissão"). The team color arrives here, as the reward for the
// choice: a 300px flat block with the crest as a giant watermark, then the
// numbers, the owner's mandate (gold inset), the core and the coach.

interface TeamConfirmProps {
  team: Team;
  players: { [key: string]: Player };
  teams: Team[];
  onBack: () => void;
  onConfirm: () => void;
}

const HERO = 300;
const money = (v: number) => `$${Math.round(v / 1_000_000)}M`;

const TeamConfirm: React.FC<TeamConfirmProps> = ({ team, players, teams, onBack, onConfirm }) => {
  const insets = useSafeAreaInsets();
  const accent = getTeamAccent(team.id);
  const ink = onAccent(accent.primary);
  const inkA = (a: number) => withAlpha(ink === '#ffffff' ? '#ffffff' : '#000000', a);

  const owner = buildSeasonOwner(team, teams, players);
  const mandate = MANDATE_META[owner.mandate];
  const salary = getTeamSalary(team, players);
  const rating = teamRating(team, players);
  const rank = [...teams].sort((a, b) => teamRating(b, players) - teamRating(a, players)).findIndex((t) => t.id === team.id) + 1;
  const titles = TEAM_TITLES[team.id] ?? 0;

  const core = team.roster
    .map((id) => players[id])
    .filter(Boolean)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 3);

  return (
    <Screen
      heroHeight={HERO}
      backdrop={<HeroBackdrop height={HERO + insets.top} primary={accent.primary} secondary={accent.secondary} />}
      footer={<Dock><CtaButton label="Assinar como GM" onPress={onConfirm} size={20} /></Dock>}
    >
      <View style={{ height: HERO - 6, paddingHorizontal: 20, paddingTop: 4, overflow: 'hidden' }}>
        {/* The crest, oversized and half-transparent over the flat team color:
            the franchise's own colors carry the block instead of a tricode. */}
        <TeamLogo teamId={team.id} size={300} style={{ position: 'absolute', right: -60, top: -10, opacity: 0.22 }} />
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={12} className="active:opacity-60" style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.4, color: ink }}>‹ VOLTAR</Text>
        </Pressable>
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 26, gap: 6 }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 2.4, color: inkA(0.8) }}>
            {getTeamCity(team).toUpperCase()} · {team.conference === 'East' ? 'LESTE' : 'OESTE'}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontFamily: FONT.cond800, fontSize: 64, lineHeight: 58, color: ink, textTransform: 'uppercase' }}>
            {getTeamNickname(team)}
          </Text>
          <Text style={{ fontFamily: FONT.body500, fontSize: 14, color: inkA(0.9) }}>
            {titles} {titles === 1 ? 'título' : 'títulos'}
          </Text>
        </View>
      </View>

      <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 10, marginTop: 6 }}>
        <StatStrip
          size={28}
          items={[
            { label: `Força · ${rank}º`, value: rating },
            { label: 'Folha', value: money(salary), color: salary > SALARY_CAP ? COLORS.warn : COLORS.text },
            { label: 'Escolhas', value: PICK_WINDOW },
          ]}
        />
      </View>

      <Body top={16} gap={12}>
        <Panel bar={COLORS.gold} style={{ gap: 6 }}>
          <SectionLabel color={COLORS.gold}>Mandato da diretoria</SectionLabel>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 22, lineHeight: 22, color: COLORS.text, textTransform: 'uppercase' }}>{mandate.label}</Text>
          <BodyText>Meta de {owner.targetWins} vitórias. {mandate.blurb}</BodyText>
        </Panel>

        <View>
          <SectionLabel>Peças principais</SectionLabel>
          {core.map((p, i) => (
            <View key={p.id} className="flex-row items-center" style={{ height: 42, gap: 10, borderBottomWidth: i < core.length - 1 ? 1 : 0, borderBottomColor: COLORS.lineSoft }}>
              <Text style={{ width: 24, fontFamily: FONT.cond800, fontSize: 12, color: COLORS.dim }}>{p.pos}</Text>
              <Name size={16} style={{ flex: 1 }}>{p.name}</Name>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 20, color: ovrColor(p.ovr) }}>{p.ovr}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row justify-between items-center" style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.line }}>
          <SectionLabel>Técnico</SectionLabel>
          <Name size={15}>{team.coach}</Name>
        </View>
      </Body>
    </Screen>
  );
};

export default TeamConfirm;
