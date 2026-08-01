import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { Team, Player } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamAccent } from '../constants';
import { simulationEngine, ROTATION_MIN, ROTATION_MAX, DEFAULT_ROTATION_SIZE } from '../services/simulationService';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import { Panel, Well, MonoLabel, Stat, Meter } from './ui/kit';
import Icon from './Icon';

const loadColor = (load: number) => (load >= 75 ? COLORS.bad : load >= 50 ? COLORS.warn : COLORS.goodSoft);
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
    <Panel padding={14}>
      <MonoLabel style={{ marginBottom: 11 }}>Rotação &amp; carga</MonoLabel>

      <Well padding={12} className="flex-row items-center justify-between">
        <View style={{ flex: 1, paddingRight: 12 }}>
          <MonoLabel size={9}>Tamanho da rotação</MonoLabel>
          <Text style={{ fontSize: 10.5, lineHeight: 15, color: INK.faint, marginTop: 3 }}>
            Mais jogadores em quadra = menos carga por titular
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 11 }}>
          <Stepper label="−" disabled={size <= ROTATION_MIN} onPress={() => onSetRotationSize(size - 1)} />
          <Stat size={19} style={{ width: 22, textAlign: 'center' }}>{size}</Stat>
          <Stepper label="+" disabled={size >= ROTATION_MAX} onPress={() => onSetRotationSize(size + 1)} />
        </View>
      </Well>

      <View style={{ gap: 8, marginTop: 10 }}>
        {rotation.map((p) => {
          const load = p.load ?? 0;
          const isManaged = managed.has(p.id);
          return (
            <Well key={p.id} padding={10} className="flex-row items-center" style={{ gap: 10 }}>
              <Image
                source={{ uri: getPlayerImageUrl(p) }}
                placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                style={{ width: 32, height: 32, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                contentFit="cover"
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* adjustsFontSizeToFit, not truncation: a rotation list where
                    two names both read "Shai Gilgeous-A…" is unusable. */}
                <Text
                  className="font-bold text-white"
                  style={{ fontSize: 12.5 }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {p.name}
                </Text>
                <Meter value={load / 100} color={loadColor(load)} height={5} style={{ marginTop: 6 }} />
              </View>
              <View className="items-end" style={{ width: 76 }}>
                <MonoLabel size={9} color={loadColor(load)} style={{ letterSpacing: 0.3 }} numberOfLines={1}>
                  {loadLabel(load)}
                </MonoLabel>
                {/* Math.round, not the raw float — an un-rounded load renders as
                    "63.41176470588235%" and blows the row apart. */}
                <MonoLabel size={9} color={INK.faint} style={{ letterSpacing: 0, marginTop: 2 }}>
                  {Math.round(load)}%
                </MonoLabel>
              </View>
              <Pressable
                onPress={() => onToggleLoadManagement(p.id)}
                className="active:opacity-70"
                style={{
                  width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1,
                  backgroundColor: isManaged ? withAlpha(accent.primary, 0.2) : COLORS.panel,
                  borderColor: isManaged ? accent.primary : COLORS.line,
                }}
              >
                <Icon name="battery" size={16} color={isManaged ? accent.primary : COLORS.navIdle} />
              </Pressable>
            </Well>
          );
        })}
      </View>
    </Panel>
  );
};

const Stepper: React.FC<{ label: string; disabled: boolean; onPress: () => void }> = ({ label, disabled, onPress }) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    className="active:opacity-70"
    style={{
      width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
      backgroundColor: COLORS.line, opacity: disabled ? 0.4 : 1,
    }}
  >
    <Text className="font-black" style={{ fontSize: 17, color: '#fff', lineHeight: 20 }}>{label}</Text>
  </Pressable>
);

export default RotationPanel;
