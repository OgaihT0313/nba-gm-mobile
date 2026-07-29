import React from 'react';
import { View, Text } from 'react-native';
import { CupState, Team } from '../types';
import Card from './Card';
import Icon from './Icon';

// RN port of the web's "NBA Cup" panel. The web's `grid-cols-1 sm:grid-cols-2`
// group grid becomes a two-up wrap (phones only ever saw the single column, but
// the groups are short enough to pair up at 375px).
interface CupPanelProps {
  cup?: CupState;
  teams: Team[];
}

const CupPanel: React.FC<CupPanelProps> = ({ cup, teams }) => {
  const teamName = (id?: string | null) => teams.find((t) => t.id === id)?.name;

  return (
    <Card>
      <View className="flex-row items-center gap-2.5 mb-4">
        <Icon name="cup" size={20} color="#fbbf24" />
        <Text className="font-bold text-lg text-white">NBA Cup</Text>
      </View>

      {cup?.championId ? (
        <View className="gap-2">
          <Text className="text-sm text-slate-300">
            Campeão: <Text className="font-black text-amber-400">{teamName(cup.championId)}</Text>
          </Text>
          {cup.bracket?.final ? (
            <Text className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              Final: {cup.bracket.final.m.map((t) => t?.name).join(' vs ')} ({cup.bracket.final.s})
            </Text>
          ) : null}
        </View>
      ) : cup ? (
        <View className="flex-row flex-wrap justify-between">
          {Object.entries(cup.groups).map(([groupId, teamIds]) => (
            <View
              key={groupId}
              className="w-[48%] mb-2 bg-slate-950/50 rounded-xl p-3 border border-slate-800/60"
            >
              <Text className="font-bold text-slate-400 uppercase tracking-widest text-[10px] mb-1">
                {groupId}
              </Text>
              {teamIds.map((id) => (
                <Text key={id} className="text-slate-300 text-[11px]" numberOfLines={1}>
                  {teamName(id)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-slate-500 italic text-sm">Aguardando sorteio dos grupos.</Text>
      )}
    </Card>
  );
};

export default CupPanel;
