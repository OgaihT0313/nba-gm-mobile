import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Team, Player } from '../types';
import { getTeamNickname, getTeamAccent, getTeamCity, TEAM_TITLES } from '../constants';
import { teamRating } from '../services/formService';
import { COLORS, FONT, withAlpha, onAccent } from '../src/theme/tokens';
import { Eyebrow, HeroTitle, TeamBadge, TeamLogo, CtaButton, BodyText, StatStrip } from '../components/ui/kit';
import { useDesktop } from '../components/desktop/useDesktop';
import { BackLink } from '../components/desktop/kit';

// Design 1a ("Transmissão"). The two conferences side by side — West red, East
// blue, the colors they carry through the whole app — fifteen 36px rows each,
// ordered by roster strength. Tapping a row selects it; the CTA confirms.

interface TeamSelectProps {
  teams: Team[];
  players: { [key: string]: Player };
  onSelect: (teamId: string) => void;
  /** Back to the era picker (PC). */
  onBack?: () => void;
  /** The season being started, for the PC eyebrow. */
  seasonLabel?: string;
}

const ROW = 36;

const Column: React.FC<{
  label: string;
  color: string;
  teams: Team[];
  players: { [key: string]: Player };
  selected: string | null;
  onPick: (id: string) => void;
  rowHeight?: number;
}> = ({ label, color, teams, players, selected, onPick, rowHeight = ROW }) => (
  <View style={{ flex: 1, minWidth: 0 }}>
    <View
      className="flex-row justify-between items-baseline"
      style={{ backgroundColor: color, borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}
    >
      <Text style={{ fontFamily: FONT.cond800, fontSize: 22, lineHeight: 22, letterSpacing: 1.3, color: '#fff' }}>{label}</Text>
      <Text style={{ fontFamily: FONT.cond600, fontSize: 11, letterSpacing: 0.9, color: 'rgba(255,255,255,0.85)' }}>OVR</Text>
    </View>
    <View style={{ backgroundColor: COLORS.surface, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' }}>
      {teams.map((t) => {
        const on = t.id === selected;
        return (
          <Pressable
            key={t.id}
            onPress={() => onPick(t.id)}
            accessibilityRole="button"
            accessibilityLabel={getTeamNickname(t)}
            aria-selected={on}
            className="flex-row items-center active:opacity-75"
            style={{
              height: rowHeight, gap: rowHeight > ROW ? 10 : 8, paddingLeft: 7, paddingRight: 9,
              borderBottomWidth: 1, borderBottomColor: COLORS.line,
              backgroundColor: on ? withAlpha(getTeamAccent(t.id).primary, 0.32) : 'transparent',
            }}
          >
            {on ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#fff' }} /> : null}
            <TeamBadge teamId={t.id} width={32} height={22} />
            <TeamLogo teamId={t.id} size={22} />
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: FONT.cond600, fontSize: 15, color: COLORS.text }}>
              {getTeamNickname(t)}
            </Text>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: COLORS.muted, fontVariant: ['tabular-nums'] }}>
              {teamRating(t, players)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const TeamSelect: React.FC<TeamSelectProps> = ({ teams, players, onSelect, onBack, seasonLabel }) => {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  // Sorted by the number the row shows (teamRating), not powerRank (top-8
  // average): two different measures put an 85 below an 84.
  const byRank = useMemo(() => [...teams].sort((a, b) => teamRating(b, players) - teamRating(a, players)), [teams, players]);
  const west = byRank.filter((t) => t.conference === 'West');
  const east = byRank.filter((t) => t.conference === 'East');
  const [selected, setSelected] = useState<string | null>(byRank[0]?.id ?? null);
  const team = teams.find((t) => t.id === selected);
  const titles = team ? TEAM_TITLES[team.id] ?? 0 : 0;

  // PC: West and East as two full columns, plus a preview of the selected
  // franchise in a third — the hero block the phone only shows one step later.
  if (desktop) {
    const accent = getTeamAccent(team?.id);
    const ink = onAccent(accent.primary);
    const inkSoft = withAlpha(ink === '#ffffff' ? '#ffffff' : '#000000', 0.8);
    const rank = team ? byRank.findIndex((t) => t.id === team.id) + 1 : 0;
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingTop: 40, paddingHorizontal: 64, paddingBottom: 20, gap: 6 }}>
          {onBack ? <BackLink onPress={onBack} /> : null}
          <Eyebrow size={12}>Passo 2 de 2{seasonLabel ? ` · ${seasonLabel}` : ''}</Eyebrow>
          <HeroTitle size={48}>Escolha sua franquia</HeroTitle>
        </View>
        <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 64, paddingBottom: 40 }}>
          <ScrollView style={{ flex: 1, minWidth: 0 }}>
            <Column label="Oeste" color={COLORS.west} teams={west} players={players} selected={selected} onPick={setSelected} rowHeight={40} />
          </ScrollView>
          <ScrollView style={{ flex: 1, minWidth: 0 }}>
            <Column label="Leste" color={COLORS.east} teams={east} players={players} selected={selected} onPick={setSelected} rowHeight={40} />
          </ScrollView>
          <View style={{ width: 400, backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden' }}>
            {team ? (
              <>
                <View style={{ height: 260, overflow: 'hidden' }}>
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 5, backgroundColor: accent.primary }} />
                  <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: accent.secondary }} />
                  <TeamLogo teamId={team.id} size={260} style={{ position: 'absolute', right: -50, top: -10, opacity: 0.22 }} />
                  <View style={{ position: 'absolute', left: 22, right: 22, bottom: 26, gap: 6 }}>
                    <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 2.4, color: inkSoft }}>
                      {getTeamCity(team).toUpperCase()} · {team.conference === 'East' ? 'LESTE' : 'OESTE'}
                    </Text>
                    <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 52, lineHeight: 48, color: ink, textTransform: 'uppercase' }}>{getTeamNickname(team)}</Text>
                  </View>
                </View>
                <View style={{ paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                  <StatStrip size={28} items={[{ label: `Força · ${rank}º`, value: teamRating(team, players) }, { label: 'Títulos', value: titles }]} />
                </View>
                <View style={{ flex: 1 }} />
                <View style={{ padding: 16, gap: 8 }}>
                  <BodyText size={13} style={{ fontFamily: FONT.body600 }}>{team.name}</BodyText>
                  <CtaButton label={`Assumir o ${getTeamNickname(team)}`} onPress={() => onSelect(team.id)} />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: COLORS.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: 14, gap: 6 }}>
        <Eyebrow>Passo 2 de 2</Eyebrow>
        <HeroTitle size={34}>Escolha sua franquia</HeroTitle>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row" style={{ gap: 8 }}>
          <Column label="Oeste" color={COLORS.west} teams={west} players={players} selected={selected} onPick={setSelected} />
          <Column label="Leste" color={COLORS.east} teams={east} players={players} selected={selected} onPick={setSelected} />
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 8 }}>
        {team ? (
          <View className="flex-row justify-between">
            <BodyText size={13} style={{ fontFamily: FONT.body600 }}>{team.name}</BodyText>
            <BodyText size={13} style={{ fontFamily: FONT.body600 }}>
              OVR {teamRating(team, players)} · {titles} {titles === 1 ? 'título' : 'títulos'}
            </BodyText>
          </View>
        ) : null}
        <CtaButton
          label={team ? `Assumir o ${getTeamNickname(team)}` : 'Escolha um time'}
          onPress={() => team && onSelect(team.id)}
          disabled={!team}
        />
      </View>
    </View>
  );
};

export default TeamSelect;
