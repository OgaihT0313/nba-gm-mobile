import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { SeasonState } from '../types';
import { COLORS, INK } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, FilterRow } from '../components/ui/kit';
import StandingsTable from '../components/StandingsTable';
import LeadersPanel from '../components/LeadersPanel';

// Design 3e — the densest screen in the app, so it's one tab bar over one
// panel rather than four stacked cards. Conference first (your team pinned and
// washed in the franchise color), league leaders on the same tab strip because
// it's the same glance.

const TABS = [
  { id: 'West', label: 'Oeste' },
  { id: 'East', label: 'Leste' },
  { id: 'leaders', label: 'Líderes' },
];

const StandingsScreen: React.FC<{ season: SeasonState }> = ({ season }) => {
  // Open on the user's own conference — the standings you actually came to read.
  const userTeam = season.teams.find((t) => t.id === season.userTeamId);
  const [tab, setTab] = useState<string>(userTeam?.conference ?? 'West');

  return (
    <Screen heroHeight={132}>
      <HeroContent>
        <Eyebrow>A liga · jogo {season.gamesPlayed} de 82</Eyebrow>
        <FilterRow items={TABS} value={tab} onChange={setTab} style={{ marginTop: 13 }} />
      </HeroContent>

      <Body top={16}>
        {tab === 'leaders' ? (
          <LeadersPanel players={season.players} teams={season.teams} userTeamId={season.userTeamId} />
        ) : (
          <Panel padding={13}>
            <StandingsTable
              teams={season.teams}
              conference={tab as 'East' | 'West'}
              schedule={season.schedule}
              userTeamId={season.userTeamId}
            />
          </Panel>
        )}

        <Text style={{ fontSize: 10.5, lineHeight: 15, color: INK.faint, paddingHorizontal: 4 }}>
          {tab === 'leaders'
            ? 'Médias por jogo da temporada regular em curso.'
            : 'Ordenada pelos critérios de desempate reais da NBA (confronto direto, campanha na conferência).'}
        </Text>
      </Body>
    </Screen>
  );
};

export default StandingsScreen;
