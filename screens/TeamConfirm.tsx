import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { Team, Player } from '../types';
import {
  getTeamLogoUrl, getTeamNickname, getTeamCity, conferenceLabel, TEAM_TITLES,
  getTeamSalary, SALARY_CAP, attributeColor,
} from '../constants';
import { buildSeasonOwner, MANDATE_META } from '../services/ownerService';
import { PICK_WINDOW } from '../services/draftService';
import { teamRating } from '../services/formService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, HeroTitle, Stat, CtaButton, Initials, StatTile } from '../components/ui/kit';

// Design 4c — the hinge of the whole redesign. This is the exact moment the app
// gains a color: the picker before it is black and white, and this screen opens
// full-bleed in the franchise's own gradient. The mandate, the roster and the
// cap situation are all on the table BEFORE you commit, so taking the Wizards
// is an informed choice rather than a surprise two hours in.

interface TeamConfirmProps {
  team: Team;
  players: { [key: string]: Player };
  teams: Team[];
  onBack: () => void;
  onConfirm: () => void;
}

const TeamConfirm: React.FC<TeamConfirmProps> = ({ team, players, teams, onBack, onConfirm }) => {
  const { accent } = useTheme();

  // The same mandate the owner will actually hold the user to all season —
  // derived here from the untouched roster, not a separate marketing blurb.
  const owner = buildSeasonOwner(team, teams, players);
  const mandate = MANDATE_META[owner.mandate];

  const salary = getTeamSalary(team, players);
  const capPct = Math.round((salary / SALARY_CAP) * 100);
  const rating = teamRating(team, players);
  const titles = TEAM_TITLES[team.id] ?? 0;

  const core = team.roster
    .map((id) => players[id])
    .filter(Boolean)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 3);

  return (
    <Screen
      heroHeight={360}
      footer={<CtaButton label={`Assumir o ${getTeamNickname(team)}`} onPress={onConfirm} size={15} />}
    >
      <HeroContent>
        <Pressable onPress={onBack} hitSlop={12} className="active:opacity-60">
          <Text className="font-bold" style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>‹ Voltar</Text>
        </Pressable>

        <View className="items-center" style={{ marginTop: 14 }}>
          <Image source={{ uri: getTeamLogoUrl(team) }} style={{ width: 92, height: 92 }} contentFit="contain" />
          <HeroTitle size={34} style={{ marginTop: 14, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
            {getTeamNickname(team)}
          </HeroTitle>
          <MonoLabel size={10} color="rgba(255,255,255,0.7)" style={{ marginTop: 7, textAlign: 'center' }} numberOfLines={1}>
            {getTeamCity(team)} · {conferenceLabel(team)} · {titles} {titles === 1 ? 'título' : 'títulos'}
          </MonoLabel>
        </View>
      </HeroContent>

      <Body top={24}>
        <Panel bar={COLORS.cta} padding={14}>
          <MonoLabel>Mandato da diretoria</MonoLabel>
          <HeroTitle size={17} style={{ marginTop: 7 }}>{mandate.label}</HeroTitle>
          <Text style={{ fontSize: 11.5, lineHeight: 17, color: INK.body, marginTop: 6 }}>{mandate.blurb}</Text>
          <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 8, letterSpacing: 0 }}>
            Meta: {owner.targetWins} vitórias
          </MonoLabel>
        </Panel>

        <View className="flex-row" style={{ gap: 10 }}>
          <StatTile label="Força" value={rating} color={attributeColor(rating)} />
          <StatTile label="Folha" value={`${capPct}%`} color={capPct > 95 ? COLORS.warn : COLORS.goodSoft} />
          <StatTile label="Escolhas" value={PICK_WINDOW} />
        </View>

        <Panel padding={13}>
          <MonoLabel>Peças principais</MonoLabel>
          <View style={{ gap: 10, marginTop: 10 }}>
            {core.map((p, i) => (
              <View key={p.id} className="flex-row items-center" style={{ gap: 11 }}>
                <Initials
                  name={p.name}
                  size={30}
                  gradient={i === 0 ? [accent.primary, accent.secondary] : undefined}
                />
                <View style={{ flex: 1 }}>
                  <Text className="font-bold text-white" style={{ fontSize: 12 }} numberOfLines={1}>{p.name}</Text>
                  <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 2, letterSpacing: 0 }}>
                    {p.age}a · {p.pos}
                  </MonoLabel>
                </View>
                <Stat size={15} color={attributeColor(p.ovr)}>{p.ovr}</Stat>
              </View>
            ))}
          </View>
          <View
            className="flex-row justify-between items-baseline"
            style={{ marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: COLORS.line }}
          >
            <MonoLabel size={10} color={INK.faint} style={{ letterSpacing: 0 }}>Técnico</MonoLabel>
            <Text className="font-bold text-white" style={{ fontSize: 11 }}>{team.coach}</Text>
          </View>
        </Panel>
      </Body>
    </Screen>
  );
};

export default TeamConfirm;
