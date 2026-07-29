import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Team, Player, Coach, GmLegacy, OwnerExpectation } from '../types';
import { getTeamLogoUrl, getTeamSalary, SALARY_CAP, getTeamAccent, getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, coachOf } from '../constants';
import { MIN_ROSTER_SIZE } from '../services/tradeService';
import { simulationEngine } from '../services/simulationService';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import OwnerBox from '../components/OwnerBox';
import PlayerCard from '../components/PlayerCard';
import StartersCourt from '../components/StartersCourt';
import TeamAnalytics from '../components/TeamAnalytics';
import TeamComparisonChart from '../components/TeamComparisonChart';
import PickAssets from '../components/PickAssets';
import CoachPanel from '../components/CoachPanel';
import RotationPanel from '../components/RotationPanel';
import Icon from '../components/Icon';

interface MyTeamHubProps {
  team: Team;
  players: { [key: string]: Player };
  allTeams: Team[];
  coaches: { [key: string]: Coach };
  gmLegacy: GmLegacy;
  owner: OwnerExpectation;
  // Which draft is next (1-indexed), so a pick can be shown as "this draft" or
  // "in 2 drafts" instead of a bare number.
  currentDraft: number;
  onWaive: (playerId: string) => void;
  onSetStarter: (pos: string, playerId: string) => void;
  onFireCoach: () => void;
  onHireCoach: (coach: Coach) => void;
  onSetRotationSize: (size: number) => void;
  onToggleLoadManagement: (playerId: string) => void;
}

const formatMoney = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

const MyTeamHub: React.FC<MyTeamHubProps> = ({
  team, players, allTeams, coaches, gmLegacy, owner, currentDraft,
  onWaive, onSetStarter, onFireCoach, onHireCoach, onSetRotationSize, onToggleLoadManagement,
}) => {
  const [confirmWaive, setConfirmWaive] = useState<Player | null>(null);
  const [rivalId, setRivalId] = useState<string | null>(null);
  const [rivalPickerOpen, setRivalPickerOpen] = useState(false);
  const rival = allTeams.find((t) => t.id === rivalId) || null;
  const coach = coachOf(team, coaches);

  const salary = getTeamSalary(team, players);
  const capSpace = SALARY_CAP - salary;
  const accent = getTeamAccent(team.id);

  const roster = team.roster.map((pId) => players[pId]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const contracts = [...roster].sort((a, b) => b.salary - a.salary);
  const canWaive = team.roster.length > MIN_ROSTER_SIZE;

  const chemistry = Math.round(simulationEngine.teamChemistry(team, players));
  const chemTone = chemistry >= 70 ? 'positive' : chemistry >= 45 ? 'warning' : 'danger';

  const absences = Object.entries(team.playerAbsences || {})
    .map(([id, a]) => ({ player: players[id], reason: (a as { reason: string }).reason, games: (a as { duration: number }).duration }))
    .filter((x) => x.player)
    .sort((a, b) => b.games - a.games);

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        {/* Header */}
        <Card variant="offseason" padding="lg" accentColor={accent.primary} className="gap-5">
          <View className="flex-row items-center gap-4">
            <Image source={{ uri: getTeamLogoUrl(team) }} style={{ width: 64, height: 64 }} contentFit="contain" />
            <View className="flex-1 min-w-0">
              <Text className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent.primary }}>Meu Time</Text>
              <Text className="text-2xl font-black uppercase italic tracking-tighter text-white" numberOfLines={2}>{team.name}</Text>
              <Text className="text-slate-400 text-xs">
                {team.conference === 'East' ? 'Leste' : 'Oeste'} · {coach?.name ?? 'Sem técnico'}
                {typeof team.wins === 'number' ? ` · ${team.wins}-${team.losses}` : ''}
              </Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-3">
            <View className="flex-1"><StatCard label="Cap Space" value={capSpace >= 0 ? formatMoney(capSpace) : `-${formatMoney(Math.abs(capSpace))}`} sub={`${formatMoney(salary)} / ${formatMoney(SALARY_CAP)}`} tone={capSpace >= 0 ? 'positive' : 'warning'} /></View>
            <View className="flex-1"><StatCard label="Química" value={`${chemistry}%`} sub={chemistry >= 70 ? 'Unido' : chemistry >= 45 ? 'Tenso' : 'Rachado'} tone={chemTone} /></View>
            <View className="flex-1"><StatCard label="Legado GM" value={gmLegacy.titles} sub={`${gmLegacy.seasons} temp.`} tone="warning" /></View>
          </View>
        </Card>

        <OwnerBox owner={owner} />

        {/* Medical */}
        {absences.length > 0 ? (
          <Card variant="offseason" accentColor="#f87171" padding="lg" className="gap-4">
            <View className="flex-row items-center gap-2.5">
              <Icon name="medical" size={20} color="#f87171" />
              <Text className="text-lg font-bold text-white">Departamento Médico</Text>
              <Text className="text-[11px] font-black uppercase text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">{absences.length} fora</Text>
            </View>
            <View className="gap-2">
              {absences.map(({ player, reason, games }) => (
                <View key={player.id} className="flex-row items-center justify-between bg-slate-950/40 rounded-xl px-3 py-2.5">
                  <View className="flex-row items-center gap-3 flex-1 min-w-0">
                    <Image source={{ uri: getPlayerImageUrl(player) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                    <View className="flex-1 min-w-0">
                      <Text className="font-bold text-sm text-white" numberOfLines={1}>{player.name}</Text>
                      <Text className="text-[10px] font-bold uppercase tracking-widest text-red-400">{reason === 'injury' ? 'Lesão' : 'Suspensão'}</Text>
                    </View>
                  </View>
                  <Text className="text-xs font-black text-slate-300">{games} {games === 1 ? 'jogo' : 'jogos'}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <StartersCourt team={team} players={players} onSetStarter={onSetStarter} />

        <CoachPanel team={team} coaches={coaches} editable onFire={onFireCoach} onHire={onHireCoach} />

        <RotationPanel team={team} players={players} onSetRotationSize={onSetRotationSize} onToggleLoadManagement={onToggleLoadManagement} />

        {/* Draft capital — the other half of the roster, sitting next to it on
            purpose: selling the present for picks is a decision you should see
            both sides of. */}
        <Card padding="lg">
          <PickAssets team={team} teams={allTeams} currentDraft={currentDraft} title="Seu capital de draft" />
        </Card>

        <TeamAnalytics team={team} players={players} />

        {/* Rival comparison */}
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Comparar com Rival</Text>
            <Pressable onPress={() => setRivalPickerOpen(true)} className="flex-row items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
              <Text className="text-xs font-bold text-white">{rival?.name || 'Selecione'}</Text>
              <Icon name="chevron-down" size={14} color="#64748b" />
            </Pressable>
          </View>
          <TeamComparisonChart team1={team} team2={rival} players={players} />
        </View>

        {/* Contracts */}
        <View className="gap-3">
          <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Contratos</Text>
          <Card padding="sm" className="gap-1">
            {contracts.map((p) => (
              <View key={p.id} className="flex-row items-center gap-3 px-1 py-2">
                <Image source={{ uri: getPlayerImageUrl(p) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                <Text className="flex-1 font-bold text-sm text-white" numberOfLines={1}>{p.name}</Text>
                <Text className="font-black text-accent w-8 text-center">{p.ovr}</Text>
                <Text className="font-mono text-emerald-400 text-xs w-14 text-right">{formatMoney(p.salary)}</Text>
                <Text className="font-mono text-slate-400 text-xs w-5 text-right">{p.contractYears}</Text>
                <Pressable onPress={() => canWaive && setConfirmWaive(p)} disabled={!canWaive} className="w-6 items-center">
                  <Icon name="waive" size={16} color={canWaive ? '#64748b' : '#334155'} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>

        {/* Roster */}
        <View className="gap-3">
          <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Elenco ({roster.length})</Text>
          <View className="flex-row flex-wrap justify-between">
            {roster.map((player) => (
              <View key={player.id} className="w-[48%] mb-3">
                <PlayerCard player={player} isDetailed />
              </View>
            ))}
          </View>
        </View>

      </View>

      {/* Rival picker */}
      <Modal visible={rivalPickerOpen} transparent animationType="slide" onRequestClose={() => setRivalPickerOpen(false)}>
        <Pressable className="flex-1 bg-black/70 justify-end" onPress={() => setRivalPickerOpen(false)}>
          <Pressable className="bg-slate-950 border-t border-slate-800 rounded-t-3xl p-4 max-h-[70%]" onPress={(e) => e.stopPropagation()}>
            <View className="w-10 h-1 bg-slate-700 rounded-full self-center mb-4" />
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Comparar com</Text>
            <ScrollView>
              {allTeams.filter((t) => t.id !== team.id).map((t) => (
                <Pressable key={t.id} onPress={() => { setRivalId(t.id); setRivalPickerOpen(false); }} className="flex-row items-center gap-3 p-3 rounded-xl active:bg-slate-900">
                  <Image source={{ uri: getTeamLogoUrl(t) }} style={{ width: 28, height: 28 }} contentFit="contain" />
                  <Text className="text-sm font-bold text-white">{t.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Waive confirmation */}
      <Modal visible={confirmWaive !== null} transparent animationType="fade" onRequestClose={() => setConfirmWaive(null)}>
        <Pressable className="flex-1 bg-black/70 items-center justify-center p-4" onPress={() => setConfirmWaive(null)}>
          <Pressable className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-sm gap-4" onPress={(e) => e.stopPropagation()}>
            <Text className="text-xl font-black uppercase italic tracking-tight text-white">Dispensar jogador?</Text>
            <Text className="text-sm text-slate-400 leading-5">
              <Text className="font-bold text-white">{confirmWaive?.name}</Text> será dispensado e virará agente livre. Abre vaga no elenco e libera o salário, mas você só poderá recontratá-lo na próxima agência livre — e outro time pode assiná-lo antes.
            </Text>
            <View className="flex-row gap-3 justify-end">
              <Pressable onPress={() => setConfirmWaive(null)} className="px-4 py-2 rounded-xl"><Text className="text-sm font-bold text-slate-300">Cancelar</Text></Pressable>
              <Pressable onPress={() => { if (confirmWaive) onWaive(confirmWaive.id); setConfirmWaive(null); }} className="px-4 py-2 rounded-xl bg-red-600"><Text className="text-sm font-black uppercase text-white">Dispensar</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
};

export default MyTeamHub;
