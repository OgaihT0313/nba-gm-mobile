import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Team, Coach } from '../types';
import { coachOf, getTeamAccent } from '../constants';
import { coachFit, reputation, generateCandidates } from '../services/coachService';
import Card from './Card';
import Icon from './Icon';
import { MonoLabel } from './ui/kit';
import { onAccent } from '../src/theme/tokens';

const FIT_META: { min: number; label: string; color: string }[] = [
  { min: 1, label: 'Encaixe perfeito', color: '#34d399' },
  { min: 0.75, label: 'Bom encaixe', color: '#a3e635' },
  { min: 0.6, label: 'Encaixe razoável', color: '#fbbf24' },
  { min: 0, label: 'Fora do sistema', color: '#f87171' },
];
const fitMeta = (fit: number) => FIT_META.find((f) => fit >= f.min)!;

const AttrBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <View className="flex-1 gap-1">
    <View className="flex-row items-center justify-between">
      <Text className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</Text>
      <Text className="text-[10px] font-mono-bold text-white">{value}</Text>
    </View>
    <View className="h-1.5 rounded-full bg-line overflow-hidden">
      <View className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
    </View>
  </View>
);

const CoachCard: React.FC<{ coach: Coach; team: Team; onPress?: () => void; actionLabel?: string }> = ({ coach, team, onPress, actionLabel }) => {
  const fit = coachFit(coach, team);
  const meta = fitMeta(fit);
  const accent = getTeamAccent(team.id);
  return (
    <View className="bg-sunken rounded-2xl p-4 border border-line gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-base font-black text-white" numberOfLines={1}>{coach.name}</Text>
          <Text className="text-[11px] text-slate-500">{coach.age} anos · {coach.style} · Reputação {reputation(coach)}</Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] font-black uppercase" style={{ color: meta.color }}>{meta.label}</Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <AttrBar label="Ataque" value={coach.offense} color="#38bdf8" />
        <AttrBar label="Defesa" value={coach.defense} color="#f87171" />
        <AttrBar label="Desenv." value={coach.development} color="#a78bfa" />
      </View>
      {onPress ? (
        <Pressable onPress={onPress} className="mt-1 rounded-xl py-2.5 items-center" style={{ backgroundColor: accent.primary }}>
          <Text className="text-xs font-black uppercase" style={{ color: onAccent(accent.primary) }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

interface CoachPanelProps {
  team: Team;
  coaches: { [key: string]: Coach };
  // Read-only in TeamDetail (rival teams); interactive in MyTeamHub.
  editable?: boolean;
  onFire?: () => void;
  onHire?: (coach: Coach) => void;
}

const CoachPanel: React.FC<CoachPanelProps> = ({ team, coaches, editable, onFire, onHire }) => {
  const [confirmFire, setConfirmFire] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [candidates, setCandidates] = useState<Coach[]>([]);
  const current = coachOf(team, coaches);

  const accent = getTeamAccent(team.id);

  const openHiring = () => {
    setCandidates(generateCandidates(team, coaches, 4));
    setHiring(true);
  };

  return (
    <Card padding="lg" className="gap-4">
      <View className="flex-row items-center gap-2.5">
        <Icon name="coach" size={16} color="#94a3b8" />
        <MonoLabel>Comissão técnica</MonoLabel>
      </View>

      {current ? (
        <CoachCard team={team} coach={current} onPress={editable ? () => setConfirmFire(true) : undefined} actionLabel="Demitir técnico" />
      ) : (
        <Text className="text-[11px] text-slate-500 italic">Sem técnico no comando.</Text>
      )}

      {editable && !current ? (
        <Pressable onPress={openHiring} className="rounded-xl py-2.5 items-center" style={{ backgroundColor: accent.primary }}>
          <Text className="text-xs font-black uppercase" style={{ color: onAccent(accent.primary) }}>Contratar técnico</Text>
        </Pressable>
      ) : null}
      {editable && current ? (
        <Pressable onPress={openHiring} className="rounded-xl border border-line py-2.5 items-center">
          <Text className="text-xs font-black uppercase text-slate-300">Ver candidatos</Text>
        </Pressable>
      ) : null}

      {/* Fire confirmation */}
      <Modal visible={confirmFire} transparent animationType="fade" onRequestClose={() => setConfirmFire(false)}>
        <Pressable className="flex-1 bg-black/70 items-center justify-center p-4" onPress={() => setConfirmFire(false)}>
          <Pressable className="bg-panel border border-line rounded-3xl p-6 w-full max-w-sm gap-4" onPress={(e) => e.stopPropagation()}>
            <Text className="text-xl font-black uppercase italic tracking-tight text-white">Demitir técnico?</Text>
            <Text className="text-sm text-slate-400 leading-5">
              <Text className="font-bold text-white">{current?.name}</Text> deixa o comando do {team.name}. Você pode contratar um substituto na sequência.
            </Text>
            <View className="flex-row gap-3 justify-end">
              <Pressable onPress={() => setConfirmFire(false)} className="px-4 py-2 rounded-xl"><Text className="text-sm font-bold text-slate-300">Cancelar</Text></Pressable>
              <Pressable
                onPress={() => { setConfirmFire(false); onFire?.(); openHiring(); }}
                className="px-4 py-2 rounded-xl bg-red-600"
              >
                <Text className="text-sm font-black uppercase text-white">Demitir</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Hire candidates */}
      <Modal visible={hiring} transparent animationType="slide" onRequestClose={() => setHiring(false)}>
        <Pressable className="flex-1 bg-black/70 justify-end" onPress={() => setHiring(false)}>
          <Pressable className="bg-ink border-t border-line rounded-t-3xl p-4 max-h-[80%]" onPress={(e) => e.stopPropagation()}>
            <View className="w-10 h-1 bg-slate-700 rounded-full self-center mb-4" />
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Candidatos a técnico</Text>
            <ScrollView className="gap-3" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {candidates.map((c) => (
                <CoachCard
                  key={c.id}
                  team={team}
                  coach={c}
                  actionLabel="Contratar"
                  onPress={() => { onHire?.(c); setHiring(false); }}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
};

export default CoachPanel;
