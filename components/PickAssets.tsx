import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Team, DraftPickAsset } from '../types';
import { picksOf } from '../constants';
import { projectedPickSlot } from '../services/draftService';

// A team's draft-pick inventory. The number that matters isn't the pick itself
// but where it would land TODAY (projectedPickSlot): a rebuilding team's future
// first is a lottery ticket, a contender's is the 28th pick. Own picks read
// plainly; acquired ones lead with the team whose record decides the slot.

const slotTint = (slot: number) =>
  slot <= 3 ? { label: 'Loteria alta', color: '#34d399' }
    : slot <= 13 ? { label: 'Loteria', color: '#38bdf8' }
      : slot <= 22 ? { label: 'Meio', color: '#fbbf24' }
        : { label: 'Fim', color: '#94a3b8' };

export const PickChip: React.FC<{
  pick: DraftPickAsset;
  teams: Team[];
  ownerTeamId: string;
  currentDraft: number;
  onPress?: () => void;
  selected?: boolean;
  accent?: string;
  right?: React.ReactNode;
}> = ({ pick, teams, ownerTeamId, currentDraft, onPress, selected, accent, right }) => {
  const slot = projectedPickSlot(pick.originalTeamId, teams);
  const tint = slotTint(slot + 1);
  const origin = teams.find((t) => t.id === pick.originalTeamId);
  const own = pick.originalTeamId === ownerTeamId;
  const yearsOut = pick.draft - currentDraft;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`flex-row items-center gap-2.5 px-3 py-2 rounded-xl border ${selected ? '' : 'bg-slate-950/50 border-slate-800'}`}
      style={selected && accent ? { backgroundColor: `${accent}33`, borderColor: accent } : undefined}
    >
      <View className="items-center w-11">
        <Text className="text-[11px] font-mono-bold text-white">#{slot + 1}</Text>
        <Text className="text-[7px] font-black uppercase tracking-widest" style={{ color: tint.color }}>proj.</Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[11px] font-bold text-white" numberOfLines={1}>
          {own ? 'Seu 1º round' : `1º round do ${origin?.name ?? pick.originalTeamId}`}
        </Text>
        <Text className="text-[9px] font-bold text-slate-500" numberOfLines={1}>
          {yearsOut <= 0 ? 'este draft' : yearsOut === 1 ? 'próximo draft' : `em ${yearsOut} drafts`}
          {' · '}{tint.label}
          {pick.protection ? ` · top ${pick.protection} protegido` : ''}
        </Text>
      </View>
      {right}
    </Pressable>
  );
};

// Read-only inventory panel (My Team, Team Detail).
const PickAssets: React.FC<{
  team: Team;
  teams: Team[];
  currentDraft: number;
  title?: string;
}> = ({ team, teams, currentDraft, title = 'Picks de Draft' }) => {
  const picks = [...picksOf(team)].sort((a, b) => a.draft - b.draft);
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">{title}</Text>
        <Text className="text-[10px] font-mono-bold text-slate-500">{picks.length}</Text>
      </View>
      {picks.length === 0 ? (
        <Text className="text-[11px] text-slate-600 italic">
          Nenhum pick em mão — todos foram trocados.
        </Text>
      ) : (
        picks.map((p) => (
          <PickChip key={p.id} pick={p} teams={teams} ownerTeamId={team.id} currentDraft={currentDraft} />
        ))
      )}
    </View>
  );
};

export default PickAssets;
