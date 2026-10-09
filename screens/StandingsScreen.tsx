import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { SeasonState } from '../types';
import { COLORS, FONT } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { ScreenTitle, BodyText, Panel } from '../components/ui/kit';
import { useDesktop } from '../components/desktop/useDesktop';
import { DPage, DTitle, DLabel, Cols, Col } from '../components/desktop/kit';
import StandingsTable from '../components/StandingsTable';
import LeadersPanel from '../components/LeadersPanel';

// Design 4a ("Transmissão"). One segmented control — OESTE / LESTE / LÍDERES,
// the active conference painted in its own color — over one table. Opens on the
// user's own conference.

const TABS: { id: 'West' | 'East' | 'leaders'; label: string; color: string }[] = [
  { id: 'West', label: 'Oeste', color: COLORS.west },
  { id: 'East', label: 'Leste', color: COLORS.east },
  { id: 'leaders', label: 'Líderes', color: COLORS.lineStrong },
];

const StandingsScreen: React.FC<{ season: SeasonState }> = ({ season }) => {
  const userTeam = season.teams.find((t) => t.id === season.userTeamId);
  const [tab, setTab] = useState<string>(userTeam?.conference ?? 'West');
  const desktop = useDesktop();

  // PC: West and East side by side; the segmented control goes away and the
  // leaders keep their own page (Líderes in the sidebar).
  if (desktop) {
    return (
      <DPage>
        <DTitle eyebrow={`Jogo ${season.gamesPlayed} de 82`} title="Classificação" />
        <Cols style={{ marginTop: 24 }}>
          {(['West', 'East'] as const).map((conf) => (
            <Col key={conf}>
              <Panel padding={0} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                <DLabel size={12} color={conf === 'West' ? COLORS.west : COLORS.east} style={{ marginBottom: 8 }}>{conf === 'West' ? 'Oeste' : 'Leste'}</DLabel>
                <StandingsTable teams={season.teams} conference={conf} schedule={season.schedule} userTeamId={season.userTeamId} rowHeight={42} />
              </Panel>
            </Col>
          ))}
        </Cols>
        <BodyText size={12.5} color={COLORS.dim} style={{ marginTop: 16 }}>
          Ordenada pelos critérios de desempate reais da NBA (confronto direto, campanha na conferência).
        </BodyText>
      </DPage>
    );
  }

  return (
    <Screen heroHeight={100}>
      <ScreenTitle title="Classificação" label={`Jogo ${season.gamesPlayed} de 82`} />

      <Body top={0} gap={12}>
        <View className="flex-row" style={{ gap: 4, backgroundColor: COLORS.surface, borderRadius: 12, padding: 4 }}>
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="tab"
                aria-selected={on}
                onPress={() => setTab(t.id)}
                className="active:opacity-75"
                style={{ flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.color : 'transparent' }}
              >
                <Text style={{ fontFamily: FONT.cond800, fontSize: 14, letterSpacing: 1.4, color: on ? '#fff' : COLORS.dim, textTransform: 'uppercase' }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'leaders' ? (
          <LeadersPanel players={season.players} teams={season.teams} userTeamId={season.userTeamId} />
        ) : (
          <StandingsTable
            teams={season.teams}
            conference={tab as 'East' | 'West'}
            schedule={season.schedule}
            userTeamId={season.userTeamId}
          />
        )}

        <BodyText size={12} color={COLORS.dim}>
          {tab === 'leaders'
            ? 'Médias por jogo da temporada regular em curso.'
            : 'Ordenada pelos critérios de desempate reais da NBA (confronto direto, campanha na conferência).'}
        </BodyText>
      </Body>
    </Screen>
  );
};

export default StandingsScreen;
