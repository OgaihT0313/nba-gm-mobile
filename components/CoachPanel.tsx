import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Team, Coach } from '../types';
import { coachOf } from '../constants';
import { coachFit, reputation, generateCandidates } from '../services/coachService';
import Icon from './Icon';
import { MonoLabel, Panel, CtaButton, GhostButton, BodyText } from './ui/kit';
import { COLORS, FONT, RADIUS, withAlpha } from '../src/theme/tokens';
import BottomSheet from './ui/BottomSheet';

const FIT_META: { min: number; label: string; color: string }[] = [
  { min: 1, label: 'Encaixe perfeito', color: COLORS.good },
  { min: 0.75, label: 'Bom encaixe', color: '#A3E635' },
  { min: 0.6, label: 'Encaixe razoável', color: COLORS.warn },
  { min: 0, label: 'Fora do sistema', color: COLORS.bad },
];
const fitMeta = (fit: number) => FIT_META.find((f) => fit >= f.min)!;

const AttrBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <View style={{ flex: 1, gap: 5 }}>
    <View className="flex-row items-center justify-between">
      <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.3, color: COLORS.muted, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 13, color: COLORS.text }}>{value}</Text>
    </View>
    <View style={{ height: 5, borderRadius: 2, backgroundColor: COLORS.lineStrong, overflow: 'hidden' }}>
      <View style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, value)}%`, backgroundColor: color }} />
    </View>
  </View>
);

// "Transmissão": the coach on a surface2 well — name in condensed 800, the
// fit verdict in its color, the three ratings as flat bars.
const CoachCard: React.FC<{ coach: Coach; team: Team; onPress?: () => void; actionLabel?: string }> = ({ coach, team, onPress, actionLabel }) => {
  const fit = coachFit(coach, team);
  const meta = fitMeta(fit);
  return (
    <View style={{ backgroundColor: COLORS.surface2, borderRadius: RADIUS.card, padding: 16, gap: 14 }}>
      <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 22, lineHeight: 22, color: COLORS.text }}>{coach.name}</Text>
          <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, color: COLORS.dim, marginTop: 4 }}>{coach.age} anos · {coach.style} · Reputação {reputation(coach)}</Text>
        </View>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1, color: meta.color, textTransform: 'uppercase' }}>{meta.label}</Text>
      </View>
      <View className="flex-row" style={{ gap: 14 }}>
        <AttrBar label="Ataque" value={coach.offense} color={COLORS.east} />
        <AttrBar label="Defesa" value={coach.defense} color={COLORS.west} />
        <AttrBar label="Desenv." value={coach.development} color={COLORS.good} />
      </View>
      {onPress ? <CtaButton label={actionLabel ?? ''} onPress={onPress} size={16} style={{ minHeight: 44 }} /> : null}
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

  const openHiring = () => {
    setCandidates(generateCandidates(team, coaches, 4));
    setHiring(true);
  };

  return (
    <Panel padding={18} style={{ gap: 14 }}>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <Icon name="coach" size={16} color={COLORS.muted} />
        <MonoLabel>Comissão técnica</MonoLabel>
      </View>

      {current ? (
        <CoachCard team={team} coach={current} />
      ) : (
        <BodyText size={12.5} color={COLORS.dim}>Sem técnico no comando.</BodyText>
      )}

      {editable ? (
        <View className="flex-row" style={{ gap: 10 }}>
          {current ? <GhostButton label="Demitir técnico" color={COLORS.bad} onPress={() => setConfirmFire(true)} style={{ flex: 1, borderColor: withAlpha(COLORS.bad, 0.55) }} /> : null}
          {current
            ? <GhostButton label="Ver candidatos" onPress={openHiring} style={{ flex: 1 }} />
            : <CtaButton label="Contratar técnico" onPress={openHiring} size={16} style={{ flex: 1, minHeight: 46 }} />}
        </View>
      ) : null}

      {/* Fire confirmation */}
      <Modal visible={confirmFire} transparent animationType="fade" onRequestClose={() => setConfirmFire(false)}>
        <Pressable accessible={false} className="flex-1 bg-black/70 items-center justify-center p-4" onPress={() => setConfirmFire(false)}>
          <Pressable className="bg-panel border border-line rounded-3xl p-6 w-full max-w-sm gap-4" onPress={(e) => e.stopPropagation()}>
            <Text className="text-xl font-black uppercase italic tracking-tight text-white">Demitir técnico?</Text>
            <Text className="text-sm text-slate-400 leading-5">
              <Text className="font-bold text-white">{current?.name}</Text> deixa o comando do {team.name}. Você pode contratar um substituto na sequência.
            </Text>
            <View className="flex-row gap-3 justify-end">
              <Pressable accessibilityRole="button" onPress={() => setConfirmFire(false)} className="px-4 py-2 rounded-xl"><Text className="text-sm font-bold text-slate-300">Cancelar</Text></Pressable>
              <Pressable accessibilityRole="button"
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
      <BottomSheet visible={hiring} onClose={() => setHiring(false)} title="Candidatos a técnico" maxHeight="82%">
        {candidates.map((c) => (
          <CoachCard
            key={c.id}
            team={team}
            coach={c}
            actionLabel="Contratar"
            onPress={() => { onHire?.(c); setHiring(false); }}
          />
        ))}
      </BottomSheet>
    </Panel>
  );
};

export default CoachPanel;
