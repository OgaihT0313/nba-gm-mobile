import React from 'react';
import { View, Text } from 'react-native';
import { OwnerExpectation } from '../types';
import { MANDATE_META, confidenceZone, ZONE_META, ConfidenceZone } from '../services/ownerService';
import Card from './Card';

const ZONE_COLOR: Record<ConfidenceZone, string> = {
  safe: '#34d399',
  warm: '#fbbf24',
  hot: '#f87171',
};

const OwnerBox: React.FC<{ owner: OwnerExpectation; compact?: boolean }> = ({ owner, compact }) => {
  const zone = confidenceZone(owner.confidence);
  const meta = MANDATE_META[owner.mandate];
  const zoneMeta = ZONE_META[zone];
  const color = ZONE_COLOR[zone];

  if (compact) {
    return (
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Diretoria · {meta.label}</Text>
          <Text className="text-xs font-black uppercase" style={{ color }}>{zoneMeta.label} · {owner.confidence}%</Text>
        </View>
        <View className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <View className="h-full rounded-full" style={{ width: `${owner.confidence}%`, backgroundColor: color }} />
        </View>
      </View>
    );
  }

  return (
    <Card variant="offseason" padding="lg" accentColor={color} className="gap-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>Diretoria · Meta da Temporada</Text>
          <Text className="text-2xl font-black uppercase italic tracking-tight text-white mt-1">{meta.label}</Text>
          <Text className="text-slate-400 text-sm mt-1.5">
            Meta: <Text className="font-bold text-white">{owner.targetWins} vitórias</Text> · classificar aos playoffs
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Confiança</Text>
          <Text className="text-4xl font-black" style={{ color }}>{owner.confidence}<Text className="text-xl text-slate-600">%</Text></Text>
          <Text className="text-[11px] font-bold uppercase" style={{ color }}>{zoneMeta.label}</Text>
        </View>
      </View>
      <View className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <View className="h-full rounded-full" style={{ width: `${owner.confidence}%`, backgroundColor: color }} />
      </View>
      {owner.note ? <Text className="text-sm text-slate-400 italic">“{owner.note}”</Text> : null}
    </Card>
  );
};

export default OwnerBox;
