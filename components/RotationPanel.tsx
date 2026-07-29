import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Team, Player } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamAccent } from '../constants';
import { simulationEngine, ROTATION_MIN, ROTATION_MAX, DEFAULT_ROTATION_SIZE } from '../services/simulationService';
import Card from './Card';
import Icon from './Icon';

const loadColor = (load: number) => (load >= 75 ? '#f87171' : load >= 50 ? '#fbbf24' : '#34d399');
const loadLabel = (load: number) => (load >= 75 ? 'Sobrecarregado' : load >= 50 ? 'Cansado' : 'Descansado');

interface RotationPanelProps {
  team: Team;
  players: { [key: string]: Player };
  onSetRotationSize: (size: number) => void;
  onToggleLoadManagement: (playerId: string) => void;
}

const RotationPanel: React.FC<RotationPanelProps> = ({ team, players, onSetRotationSize, onToggleLoadManagement }) => {
  const size = team.rotationSize ?? DEFAULT_ROTATION_SIZE;
  const rotation = simulationEngine
    .getTeamRotation(team, players, size)
    .map((pId) => players[pId])
    .filter((p): p is Player => !!p)
    .sort((a, b) => (b.load ?? 0) - (a.load ?? 0));
  const managed = new Set(team.loadManagedIds ?? []);
  const accent = getTeamAccent(team.id);

  return (
    <Card padding="lg" className="gap-4">
      <View className="flex-row items-center gap-2.5">
        <Icon name="battery" size={20} color="#94a3b8" />
        <Text className="text-lg font-bold text-white flex-1">Rotação & Carga</Text>
      </View>

      <View className="flex-row items-center justify-between bg-slate-950/50 rounded-2xl px-4 py-3 border border-slate-800">
        <View className="flex-1 pr-3">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tamanho da rotação</Text>
          <Text className="text-[11px] text-slate-500 mt-0.5">Mais jogadores em quadra = menos carga por titular</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => onSetRotationSize(size - 1)}
            disabled={size <= ROTATION_MIN}
            className="w-8 h-8 rounded-lg bg-slate-800 items-center justify-center"
          >
            <Text className={`text-lg font-black ${size <= ROTATION_MIN ? 'text-slate-700' : 'text-white'}`}>−</Text>
          </Pressable>
          <Text className="text-xl font-mono-bold text-white w-6 text-center">{size}</Text>
          <Pressable
            onPress={() => onSetRotationSize(size + 1)}
            disabled={size >= ROTATION_MAX}
            className="w-8 h-8 rounded-lg bg-slate-800 items-center justify-center"
          >
            <Text className={`text-lg font-black ${size >= ROTATION_MAX ? 'text-slate-700' : 'text-white'}`}>+</Text>
          </Pressable>
        </View>
      </View>

      <View className="gap-2">
        {rotation.map((p) => {
          const load = p.load ?? 0;
          const isManaged = managed.has(p.id);
          return (
            <View key={p.id} className="flex-row items-center gap-3 bg-slate-950/40 rounded-xl px-3 py-2.5">
              <Image source={{ uri: getPlayerImageUrl(p) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
              <View className="flex-1 min-w-0">
                <Text className="font-bold text-sm text-white" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{p.name}</Text>
                <View className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1.5">
                  <View className="h-full rounded-full" style={{ width: `${Math.max(4, load)}%`, backgroundColor: loadColor(load) }} />
                </View>
              </View>
              <View className="items-end w-20">
                <Text className="text-[9px] font-black uppercase" style={{ color: loadColor(load) }} numberOfLines={1}>
                  {loadLabel(load)}
                </Text>
                <Text className="text-[9px] font-mono-bold text-slate-500">{Math.round(load)}%</Text>
              </View>
              <Pressable
                onPress={() => onToggleLoadManagement(p.id)}
                className="w-8 h-8 rounded-lg items-center justify-center border bg-slate-900 border-slate-700"
                style={isManaged ? { backgroundColor: `${accent.primary}33`, borderColor: accent.primary } : undefined}
              >
                <Icon name="battery" size={16} color={isManaged ? accent.primary : '#64748b'} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </Card>
  );
};

export default RotationPanel;
