import React from 'react';
import { View, Text } from 'react-native';
import { CupState, Team } from '../types';
import { getTeamNickname } from '../constants';
import { Panel, MonoLabel, Well, Stat } from './ui/kit';
import { COLORS, INK } from '../src/theme/tokens';

// NBA Cup, on the redesign's surface. Gold is reserved for trophies in this
// system, so the champion line is the one thing here allowed to use it.
interface CupPanelProps {
  cup?: CupState;
  teams: Team[];
}

const CupPanel: React.FC<CupPanelProps> = ({ cup, teams }) => {
  const team = (id?: string | null) => teams.find((t) => t.id === id);
  const name = (id?: string | null) => getTeamNickname(team(id)) || '—';

  return (
    <Panel padding={14}>
      <MonoLabel size={9} style={{ marginBottom: 10 }}>NBA Cup</MonoLabel>

      {cup?.championId ? (
        <View style={{ gap: 6 }}>
          <View className="flex-row items-baseline" style={{ gap: 8 }}>
            <MonoLabel size={9} color={INK.meta}>Campeão</MonoLabel>
            <Stat size={15} color={COLORS.gold}>{name(cup.championId)}</Stat>
          </View>
          {cup.bracket?.final ? (
            <MonoLabel size={9} color={INK.faint} style={{ letterSpacing: 0 }}>
              Final: {cup.bracket.final.m.map((t) => getTeamNickname(t ?? undefined)).join(' vs ')} ({cup.bracket.final.s})
            </MonoLabel>
          ) : null}
        </View>
      ) : cup ? (
        <View className="flex-row flex-wrap justify-between">
          {Object.entries(cup.groups).map(([groupId, teamIds]) => (
            <Well key={groupId} padding={10} style={{ width: '48.5%', marginBottom: 8 }}>
              <MonoLabel size={8.5} color={INK.meta}>{groupId}</MonoLabel>
              <View style={{ marginTop: 4, gap: 1 }}>
                {teamIds.map((id) => (
                  <Text key={id} style={{ fontSize: 11, color: COLORS.textSoft }} numberOfLines={1}>
                    {name(id)}
                  </Text>
                ))}
              </View>
            </Well>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 11.5, color: INK.body }}>Aguardando sorteio dos grupos.</Text>
      )}
    </Panel>
  );
};

export default CupPanel;
