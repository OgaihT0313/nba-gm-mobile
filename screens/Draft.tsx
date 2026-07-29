import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SeasonState, Player, ScoutReport } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getTeamAccent, formatPositions } from '../constants';
import { consensusValue, draftVerdict, SCOUT_BUDGET } from '../services/draftService';
import { careerAverages, honorsSummary } from '../services/careerService';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

interface DraftProps {
  season: SeasonState;
  onPick: (playerId: string) => void;
  onAutoPick: () => void;
  onFinish: () => void;
  onScout: (playerId: string) => void;
}

const POSITION_FILTERS = ['TODOS', 'PG', 'SG', 'SF', 'PF', 'C'];
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

const POTENTIAL_STYLE: { [k in Player['potential']]: { label: string; cls: string } } = {
  A: { label: 'Pot. A', cls: 'bg-emerald-500/20 text-emerald-400' },
  B: { label: 'Pot. B', cls: 'bg-sky-500/20 text-sky-400' },
  C: { label: 'Pot. C', cls: 'bg-slate-500/20 text-slate-300' },
  D: { label: 'Pot. D', cls: 'bg-amber-500/20 text-amber-400' },
};

// How wide the projected band is, in words. This is the whole read on a prospect
// before the draft: a nebulous 65-83 is a gamble, a settled 74 is a floor.
const CONFIDENCE = (u: number) =>
  u === 0 ? { label: 'Definido', color: '#34d399' }
    : u <= 3 ? { label: 'Confiável', color: '#38bdf8' }
      : u <= 6 ? { label: 'Incerto', color: '#fbbf24' }
        : { label: 'Nebuloso', color: '#f87171' };

const bandText = (r: ScoutReport) => (r.uncertainty === 0 ? `${r.estimate}` : `${r.estimate - r.uncertainty}-${r.estimate + r.uncertainty}`);

const ProspectRow: React.FC<{
  player: Player;
  report: ScoutReport;
  canPick: boolean;
  canScout: boolean;
  onPick: () => void;
  onScout: () => void;
  accent: string;
}> = ({ player, report, canPick, canScout, onPick, onScout, accent }) => {
  const pot = POTENTIAL_STYLE[report.potentialGuess];
  const conf = CONFIDENCE(report.uncertainty);
  const solved = report.potentialKnown;
  return (
    <View className="p-3 mb-2 bg-slate-900 rounded-2xl border border-slate-800 gap-2.5">
      <View className="flex-row items-center gap-3">
        <Image source={{ uri: getPlayerImageUrl(player) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b' }} contentFit="cover" />
        <View className="flex-1 min-w-0">
          <Text className="font-bold text-sm text-white" numberOfLines={1}>{player.name}</Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Text className="text-[10px] font-black text-sky-500 uppercase tracking-widest">{formatPositions(player)} · {player.age}a</Text>
            <Text className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${pot.cls}`}>
              {pot.label}{solved ? '' : '?'}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-lg font-mono-bold text-white" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {bandText(report)}
          </Text>
          <Text className="text-[8px] font-black uppercase tracking-widest" style={{ color: conf.color }}>{conf.label}</Text>
        </View>
      </View>

      {/* Everything the scouts have turned up so far — the payoff for spending a
          report, and a hint at the truth even while the band is still open. */}
      {report.notes.length > 0 ? (
        <View className="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 gap-0.5">
          {report.notes.map((n, i) => (
            <Text key={i} className="text-[10px] font-bold text-slate-400">• {n}</Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <Pressable
          onPress={canScout && !solved ? onScout : undefined}
          disabled={!canScout || solved}
          className={`flex-1 py-2 rounded-xl items-center border ${solved ? 'bg-emerald-500/10 border-emerald-500/30' : canScout ? 'bg-slate-800 border-slate-700' : 'bg-slate-900 border-slate-800'}`}
        >
          <Text className={`text-[10px] font-black uppercase tracking-widest ${solved ? 'text-emerald-400' : canScout ? 'text-slate-300' : 'text-slate-600'}`}>
            {solved ? '✓ Avaliado' : report.reports === 0 ? 'Enviar olheiro' : `Olhar de novo (${report.reports})`}
          </Text>
        </Pressable>
        <Pressable
          onPress={canPick ? onPick : undefined}
          disabled={!canPick}
          className="flex-1 py-2 rounded-xl items-center"
          style={{ backgroundColor: canPick ? accent : '#1e293b' }}
        >
          <Text className={`text-[10px] font-black uppercase tracking-widest ${canPick ? 'text-white' : 'text-slate-600'}`}>Draftar</Text>
        </Pressable>
      </View>
    </View>
  );
};

const Draft: React.FC<DraftProps> = ({ season, onPick, onAutoPick, onFinish, onScout }) => {
  const [posFilter, setPosFilter] = useState('TODOS');
  const [showRetirees, setShowRetirees] = useState(false);
  const { teams, players, userTeamId, draft } = season;
  const userTeam = teams.find((t) => t.id === userTeamId);

  // The board is ranked by the LEAGUE's read (projected rating + guessed
  // ceiling), never by the real rating — same ordering the CPU drafts off, so a
  // prospect the consensus is wrong about is mis-ranked here too.
  const available = useMemo(
    () =>
      draft
        ? draft.available
            .map((id) => players[id])
            .filter(Boolean)
            .sort((a, b) => consensusValue(draft.reports[b.id]) - consensusValue(draft.reports[a.id]))
        : [],
    [draft, players]
  );

  // Biggest names first — a career-defining retirement should lead, not the
  // fringe guys who washed out.
  const retirees = useMemo(
    () =>
      (season.lastRetirements || [])
        .map((id) => players[id])
        .filter(Boolean)
        .sort((a, b) => (b.career?.peakOvr ?? b.ovr) - (a.career?.peakOvr ?? a.ovr)),
    [season.lastRetirements, players]
  );

  if (!draft || !userTeam) return null;

  const accent = getTeamAccent(userTeam.id);
  const onClockSlot = draft.complete ? null : draft.order[draft.picks.length];
  const userOnClock = onClockSlot?.teamId === userTeamId;
  const overallPick = draft.picks.length + 1;
  const onClockTeam = teams.find((t) => t.id === onClockSlot?.teamId);
  const onClockVia = onClockSlot && onClockSlot.originalTeamId !== onClockSlot.teamId
    ? teams.find((t) => t.id === onClockSlot.originalTeamId)
    : null;
  // Picks are tradeable now, so the user can hold several — or none at all.
  const userSlots = draft.order
    .map((slot, i) => ({ slot, number: i + 1 }))
    .filter(({ slot }) => slot.teamId === userTeamId);
  const pickSummary = userSlots.length === 0
    ? 'Você não tem picks nesta edição — trocou todos.'
    : `Seus picks: ${userSlots
        .map(({ slot, number }) => {
          const via = slot.originalTeamId !== userTeamId ? teams.find((t) => t.id === slot.originalTeamId) : null;
          return `#${number}${via ? ` (via ${via.name})` : ''}`;
        })
        .join(', ')}.`;
  const filtered = posFilter === 'TODOS' ? available : available.filter((p) => (p.positions || [p.pos]).includes(posFilter));

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <Card variant="offseason" padding="lg" accentColor={accent.primary} className="gap-5">
          <PageHeader
            eyebrow="Offseason"
            title="Draft de Recrutas"
            accentColor={accent.primary}
            subtitle={`Ninguém sabe o que esses garotos vão virar — o número é projeção, não verdade. ${pickSummary}`}
            actions={
              draft.complete ? (
                <Pressable onPress={onFinish} className="bg-emerald-600 px-8 py-3 rounded-control items-center">
                  <Text className="text-white font-bold">IR PARA AGÊNCIA LIVRE</Text>
                </Pressable>
              ) : userOnClock ? (
                <Pressable onPress={onAutoPick} className="bg-slate-800 border border-slate-700 px-6 py-3 rounded-control items-center">
                  <Text className="text-slate-300 font-bold text-sm">PULAR (CPU escolhe)</Text>
                </Pressable>
              ) : undefined
            }
          />

          {!draft.complete ? (
            <View
              className={`flex-row items-center gap-3 rounded-2xl p-4 border ${userOnClock ? '' : 'border-slate-800 bg-slate-950/50'}`}
              style={userOnClock ? { borderColor: accent.primary, backgroundColor: `${accent.primary}1f` } : undefined}
            >
              {onClockTeam ? <Image source={{ uri: getTeamLogoUrl(onClockTeam) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 36, height: 36 }} contentFit="contain" /> : null}
              <View className="flex-1 min-w-0">
                <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Pick #{overallPick} — na vez{onClockVia ? ` · via ${onClockVia.name}` : ''}
                </Text>
                <Text className="font-black text-white" numberOfLines={1}>
                  {onClockTeam?.name}{userOnClock ? <Text style={{ color: accent.primary }}> (VOCÊ)</Text> : null}
                </Text>
              </View>
            </View>
          ) : (
            <Text className="text-sm font-bold text-emerald-400">
              Draft encerrado — {draft.picks.length} recrutas selecionados. Agora reforce pelo mercado.
            </Text>
          )}

          {/* The scouting budget is what turns the board into a decision: you
              can't settle 30 prospects, so you pick who's worth the certainty. */}
          {!draft.complete ? (
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Relatórios de olheiro</Text>
                <Text className="text-[11px] font-mono-bold" style={{ color: draft.scoutBudget > 0 ? '#38bdf8' : '#f87171' }}>
                  {draft.scoutBudget}/{SCOUT_BUDGET}
                </Text>
              </View>
              <View className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <View className="h-full rounded-full bg-sky-500" style={{ width: `${(draft.scoutBudget / SCOUT_BUDGET) * 100}%` }} />
              </View>
              <Text className="text-[10px] font-bold text-slate-500">
                Cada ida estreita a faixa de um recruta e traz um relatório do olheiro. Um recruta nebuloso exige mais idas — e é justamente nele que moram os achados e as furadas.
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Who left the league this offseason — the other half of the cycle the
            draft class is replacing. Collapsed by default so it never buries
            the prospects. */}
        {retirees.length > 0 ? (
          <View className="gap-3">
            <Pressable onPress={() => setShowRetirees((s) => !s)} className="flex-row items-center justify-between">
              <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">
                Aposentadorias ({retirees.length})
              </Text>
              <Text className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {showRetirees ? 'Ocultar' : 'Ver'}
              </Text>
            </Pressable>
            {showRetirees ? (
              <View>
                {retirees.map((p) => {
                  const c = p.career;
                  const avg = c ? careerAverages(c) : null;
                  const honors = c ? honorsSummary(c) : '';
                  return (
                    <View key={p.id} className="flex-row items-center gap-3 p-3 mb-2 bg-slate-900 rounded-2xl border border-amber-500/20">
                      <Image
                        source={{ uri: getPlayerImageUrl(p) }}
                        placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b' }}
                        contentFit="cover"
                      />
                      <View className="flex-1 min-w-0">
                        <Text className="font-bold text-sm text-white" numberOfLines={1}>{p.name}</Text>
                        <Text className="text-[10px] font-bold text-slate-500" numberOfLines={1}>
                          {p.age} anos · {c?.seasons ?? 0} {(c?.seasons ?? 0) === 1 ? 'temporada' : 'temporadas'}
                          {avg ? ` · ${avg.ppg.toFixed(1)} PPG` : ''}
                        </Text>
                        {honors ? (
                          <Text className="text-[10px] font-bold text-amber-400 mt-0.5" numberOfLines={1}>{honors}</Text>
                        ) : null}
                      </View>
                      <View className="items-end">
                        <Text className="text-xl font-black text-white">{c?.peakOvr ?? p.ovr}</Text>
                        <Text className="text-[8px] font-bold text-slate-500 uppercase">Pico</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Prospects */}
        <View className="gap-3">
          <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Recrutas Disponíveis ({available.length})</Text>
          <View className="flex-row flex-wrap gap-1">
            {POSITION_FILTERS.map((pos) => (
              <Pressable key={pos} onPress={() => setPosFilter(pos)} className={`px-2.5 py-1 rounded-full border ${posFilter === pos ? 'bg-accent border-accent' : 'bg-slate-900/50 border-slate-800'}`}>
                <Text className={`text-[9px] font-black uppercase tracking-widest ${posFilter === pos ? 'text-white' : 'text-slate-500'}`}>{pos}</Text>
              </Pressable>
            ))}
          </View>
          <View>
            {filtered.map((p) => (
              <ProspectRow
                key={p.id}
                player={p}
                report={draft.reports[p.id]}
                canPick={userOnClock}
                canScout={draft.scoutBudget > 0}
                onPick={() => onPick(p.id)}
                onScout={() => onScout(p.id)}
                accent={accent.primary}
              />
            ))}
            {filtered.length === 0 ? <Text className="text-sm text-slate-600 italic">Nenhum recruta nessa posição.</Text> : null}
          </View>
        </View>

        {/* Board */}
        <View className="gap-3">
          <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Escolhas ({draft.picks.length}/{draft.order.length})</Text>
          <Card padding="sm">
            {[...draft.picks].reverse().map((pick) => {
              const p = players[pick.playerId];
              const t = teams.find((tm) => tm.id === pick.teamId);
              const mine = pick.teamId === userTeamId;
              // Once drafted the truth is public, so the board doubles as the
              // scoreboard of who read the class right.
              const surprise = p?.draftInfo ? draftVerdict(p.ovr, p.draftInfo.projected, p.draftInfo.band) : null;
              const verdict = surprise === 'steal' ? { text: '🎯', color: '#34d399' } : surprise === 'bust' ? { text: '💀', color: '#f87171' } : null;
              return (
                <View
                  key={pick.pick}
                  className={`flex-row items-center gap-3 p-2 mb-1 rounded-xl ${mine ? 'border' : 'bg-slate-950/40'}`}
                  style={mine ? { backgroundColor: `${accent.primary}26`, borderColor: accent.primary } : undefined}
                >
                  <Text className="text-xs font-black text-slate-600 w-6 text-center">{pick.pick}</Text>
                  {t ? <Image source={{ uri: getTeamLogoUrl(t) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 24, height: 24 }} contentFit="contain" /> : null}
                  <View className="flex-1 min-w-0">
                    <Text className="text-xs font-bold text-white" numberOfLines={1}>
                      {p?.name}{verdict ? <Text style={{ color: verdict.color }}> {verdict.text}</Text> : null}
                    </Text>
                    <Text className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      {p ? formatPositions(p) : ''} · {p?.ovr} OVR
                      {p?.draftInfo ? ` · proj. ${p.draftInfo.projected}` : ''}
                      {pick.viaTeamId ? ` · via ${pick.viaTeamId.toUpperCase()}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
            {draft.picks.length === 0 ? <Text className="text-xs text-slate-600 italic text-center py-4">O draft ainda não começou.</Text> : null}
          </Card>
        </View>
      </View>
    </ScrollView>
  );
};

export default Draft;
