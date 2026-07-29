import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Team, Player, TradeOffer, DraftPickAsset } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getTeamSalary, SALARY_CAP, formatPositions, getPlayerPositions, picksOf } from '../constants';
import { generateAnalysis } from '../services/geminiService';
import { evaluateTradeLegality, evaluateTradeValue, TRADE_DEADLINE_GAME, playerValue, picksValue } from '../services/tradeService';
import { projectedPickSlot } from '../services/draftService';
import { PickChip } from '../components/PickAssets';
import { useTheme } from '../src/theme/ThemeProvider';
import Icon from '../components/Icon';
import PlayerDetailModal from '../components/PlayerDetailModal';
import Card from '../components/Card';

// RN port of the Trade Center. Mobile adaptations: the two team panels stack
// instead of sitting side by side, the <select> becomes a Modal team picker,
// and the roster renders inline (no nested vertical ScrollView, which fights
// the page scroll in RN).
const formatMoney = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
const POSITION_FILTERS = ['TODOS', 'PG', 'SG', 'SF', 'PF', 'C'];
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

interface TradeCenterProps {
  teams: Team[];
  players: { [key: string]: Player };
  userTeamId: string;
  gamesPlayed: number;
  currentDraft: number;
  onTradeExecute: (
    userTeamId: string,
    partnerTeamId: string,
    userAssets: string[],
    partnerAssets: string[],
    userPickIds: string[],
    partnerPickIds: string[],
    protections: { [pickId: string]: number },
  ) => void;
  offers: TradeOffer[];
  onAcceptOffer: (offerId: string) => void;
  onRejectOffer: (offerId: string) => void;
}

const PlayerSelectItem: React.FC<{ player: Player; onPress: () => void; isSelected: boolean; accent: string }> = ({ player, onPress, isSelected, accent }) => (
  <Pressable
    onPress={onPress}
    className={`flex-row justify-between items-center p-3 mb-2 rounded-xl border ${isSelected ? '' : 'bg-slate-900/50 border-slate-800'}`}
    style={isSelected ? { backgroundColor: `${accent}33`, borderColor: accent } : undefined}
  >
    <View className="flex-row items-center gap-3 flex-1 min-w-0">
      <Image source={{ uri: getPlayerImageUrl(player) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e293b' }} contentFit="cover" />
      <View className="flex-1 min-w-0">
        <Text className="font-bold text-xs text-white" numberOfLines={1}>{player.name}</Text>
        <Text className="text-[8px] font-black text-slate-500 uppercase mt-1">{formatPositions(player)} · {formatMoney(player.salary)}</Text>
      </View>
    </View>
    <Text className="font-mono-bold text-xs text-accent">{player.ovr}</Text>
  </Pressable>
);

const TeamPanel: React.FC<{
  title: string;
  team: Team | null;
  onOpenPicker?: () => void;
  assets: string[];
  incomingAssets: string[];
  players: { [key: string]: Player };
  onToggleAsset: (pId: string) => void;
  locked?: boolean;
  accent: string;
  // Pick side of the package. `onToggleProtection` is only passed for the user's
  // own panel: you can protect a pick you're sending, not one you're asking for.
  teams: Team[];
  currentDraft: number;
  pickIds: string[];
  protections: { [pickId: string]: number };
  onTogglePick: (pickId: string) => void;
  onToggleProtection?: (pickId: string) => void;
}> = ({ title, team, onOpenPicker, assets, incomingAssets, players, onToggleAsset, locked, accent, teams, currentDraft, pickIds, protections, onTogglePick, onToggleProtection }) => {
  const [posFilter, setPosFilter] = useState('TODOS');
  const teamPicks = useMemo(
    () => (team ? [...picksOf(team)].sort((a, b) => a.draft - b.draft) : []),
    [team],
  );
  const currentSalary = team ? getTeamSalary(team, players) : 0;
  const outgoing = assets.reduce((s, id) => s + (players[id]?.salary || 0), 0);
  const incoming = incomingAssets.reduce((s, id) => s + (players[id]?.salary || 0), 0);
  const projectedCapSpace = SALARY_CAP - (currentSalary - outgoing + incoming);

  const filteredRoster = team
    ? team.roster.filter((pId) => {
        const p = players[pId];
        return p && (posFilter === 'TODOS' || getPlayerPositions(p).includes(posFilter));
      })
    : [];

  return (
    <View className="bg-slate-950/50 rounded-hero p-4 border border-slate-900 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">{title}</Text>
        {team ? <Image source={{ uri: getTeamLogoUrl(team) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 32, height: 32 }} contentFit="contain" /> : null}
      </View>

      {locked ? (
        <View className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
          <Text className="text-sm font-bold text-white">{team?.name}</Text>
        </View>
      ) : (
        <Pressable onPress={onOpenPicker} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex-row justify-between items-center">
          <Text className="text-sm font-bold text-white">{team?.name || 'Selecione um time'}</Text>
          <Icon name="chevron-down" size={16} color="#64748b" />
        </Pressable>
      )}

      {team ? (
        <>
          <View className="bg-slate-900/80 rounded-2xl p-3 border border-slate-800 flex-row justify-between items-center">
            <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cap projetado</Text>
            <Text className={`text-xs font-mono-bold ${projectedCapSpace >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {projectedCapSpace >= 0 ? formatMoney(projectedCapSpace) : `-${formatMoney(Math.abs(projectedCapSpace))}`}
            </Text>
          </View>

          <View className="bg-slate-900/80 rounded-2xl p-3 border border-slate-800">
            <Text className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Pacote de Troca</Text>
            <View className="flex-row flex-wrap gap-2">
              {assets.length + pickIds.length > 0 ? (
                <>
                  {assets.map((pId) => (
                    <Pressable key={pId} onPress={() => onToggleAsset(pId)} className="px-3 py-1 rounded-full flex-row items-center gap-2" style={{ backgroundColor: accent }}>
                      <Text className="text-[10px] font-black text-white uppercase">{players[pId]?.name}</Text>
                      <Text className="text-white/60">×</Text>
                    </Pressable>
                  ))}
                  {pickIds.map((id) => {
                    const pick = teamPicks.find((p) => p.id === id);
                    if (!pick) return null;
                    const slot = projectedPickSlot(pick.originalTeamId, teams);
                    return (
                      <Pressable key={id} onPress={() => onTogglePick(id)} className="px-3 py-1 rounded-full flex-row items-center gap-2 border border-white/20" style={{ backgroundColor: `${accent}99` }}>
                        <Text className="text-[10px] font-black text-white uppercase">
                          Pick {pick.originalTeamId.toUpperCase()} ~#{slot + 1}
                          {protections[id] ? ` (top ${protections[id]} prot.)` : ''}
                        </Text>
                        <Text className="text-white/60">×</Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : <Text className="text-[10px] text-slate-600 italic">Nada selecionado.</Text>}
            </View>
          </View>

          {/* Draft capital. Selecting a pick you own is the "sell the future"
              lever; protecting it caps what the other side is really getting,
              which the CPU's valuation already knows. */}
          {teamPicks.length > 0 ? (
            <View className="bg-slate-900/80 rounded-2xl p-3 border border-slate-800 gap-2">
              <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Picks ({teamPicks.length})</Text>
              {teamPicks.map((pick) => {
                const selected = pickIds.includes(pick.id);
                return (
                  <PickChip
                    key={pick.id}
                    pick={protections[pick.id] ? { ...pick, protection: protections[pick.id] } : pick}
                    teams={teams}
                    ownerTeamId={team.id}
                    currentDraft={currentDraft}
                    onPress={() => onTogglePick(pick.id)}
                    selected={selected}
                    accent={accent}
                    right={selected && onToggleProtection ? (
                      <Pressable
                        onPress={() => onToggleProtection(pick.id)}
                        className={`px-2 py-1 rounded-lg border ${protections[pick.id] ? 'bg-amber-500/20 border-amber-500/40' : 'bg-slate-800 border-slate-700'}`}
                      >
                        <Text className={`text-[8px] font-black uppercase tracking-widest ${protections[pick.id] ? 'text-amber-400' : 'text-slate-400'}`}>
                          {protections[pick.id] ? `Top ${protections[pick.id]}` : 'Proteger'}
                        </Text>
                      </Pressable>
                    ) : undefined}
                  />
                );
              })}
            </View>
          ) : null}

          <View className="flex-row flex-wrap gap-1">
            {POSITION_FILTERS.map((pos) => (
              <Pressable
                key={pos}
                onPress={() => setPosFilter(pos)}
                className={`px-2 py-0.5 rounded-full border ${posFilter === pos ? 'bg-accent border-accent' : 'bg-slate-900/50 border-slate-800'}`}
              >
                <Text className={`text-[9px] font-black uppercase tracking-widest ${posFilter === pos ? 'text-white' : 'text-slate-500'}`}>{pos}</Text>
              </Pressable>
            ))}
          </View>

          <View>
            {filteredRoster.map((pId) => (
              <PlayerSelectItem key={pId} player={players[pId]} onPress={() => onToggleAsset(pId)} isSelected={assets.includes(pId)} accent={accent} />
            ))}
            {filteredRoster.length === 0 ? <Text className="text-[10px] text-slate-600 italic">Nenhum jogador nessa posição.</Text> : null}
          </View>
        </>
      ) : (
        <View className="py-10 items-center justify-center border-2 border-dashed border-slate-900 rounded-3xl">
          <Text className="text-slate-700 font-bold uppercase tracking-widest text-xs">Aguardando Seleção</Text>
        </View>
      )}
    </View>
  );
};

const OffersInbox: React.FC<{
  offers: TradeOffer[];
  teams: Team[];
  players: { [key: string]: Player };
  currentDraft: number;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSelectPlayer: (p: Player) => void;
  accent: string;
}> = ({ offers, teams, players, currentDraft, onAccept, onReject, onSelectPlayer, accent }) => {
  if (offers.length === 0) return null;
  const names = (ids: string[]) => ids.map((id) => players[id]).filter(Boolean);

  // Each player is a tappable chip rather than a comma-joined string: judging an
  // offer means looking the players up, and this is the only place they appear.
  const chips = (arr: Player[], tint: string) => (
    <View className="flex-row flex-wrap gap-1.5">
      {arr.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onSelectPlayer(p)}
          className={`flex-row items-center gap-1.5 px-2 py-1 rounded-lg border ${tint}`}
        >
          <Text className="text-slate-100 text-xs font-bold" numberOfLines={1}>{p.name}</Text>
          <Text className="font-mono-bold text-[10px] text-slate-400">{p.ovr}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon name="offers" size={15} color={accent} />
        <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Ofertas Recebidas ({offers.length})</Text>
      </View>
      {offers.map((offer) => {
        const from = teams.find((t) => t.id === offer.fromTeamId);
        const give = names(offer.requestIds);
        const get = names(offer.offerIds);
        // Picks the CPU is throwing in count toward the verdict, or a pick-heavy
        // offer would read as "PERDENDO" no matter how good it is.
        const offeredPicks = from ? picksOf(from).filter((p) => (offer.offerPickIds ?? []).includes(p.id)) : [];
        const giveVal = give.reduce((s, p) => s + playerValue(p), 0);
        const getVal = get.reduce((s, p) => s + playerValue(p), 0) + picksValue(offeredPicks, teams, currentDraft);
        const ratio = giveVal > 0 ? getVal / giveVal : 1;
        const verdict = ratio >= 1.05 ? { t: 'GANHANDO', c: 'text-emerald-400' } : ratio >= 0.95 ? { t: 'EQUILIBRADA', c: 'text-slate-300' } : { t: 'PERDENDO', c: 'text-red-400' };
        return (
          <View key={offer.id} className="bg-slate-900 rounded-2xl border border-slate-800 p-4 gap-3">
            <View className="flex-row items-center gap-2">
              {from ? <Image source={{ uri: getTeamLogoUrl(from) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 24, height: 24 }} contentFit="contain" /> : null}
              <Text className="text-sm font-bold text-white flex-1" numberOfLines={1}>O {from?.name} propõe uma troca</Text>
              <Text className={`text-[10px] font-black uppercase tracking-widest ${verdict.c}`}>{verdict.t}</Text>
            </View>
            <View className="gap-2">
              <View className="bg-red-900/15 border border-red-500/20 rounded-xl p-3 gap-1.5">
                <Text className="text-[9px] font-black text-red-400 uppercase tracking-widest">Você cede</Text>
                {chips(give, 'bg-red-950/40 border-red-500/25')}
              </View>
              <View className="bg-emerald-900/15 border border-emerald-500/20 rounded-xl p-3 gap-1.5">
                <Text className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Você recebe</Text>
                {get.length > 0 ? chips(get, 'bg-emerald-950/40 border-emerald-500/25') : null}
                {offeredPicks.map((p) => (
                  <PickChip key={p.id} pick={p} teams={teams} ownerTeamId={offer.fromTeamId} currentDraft={currentDraft} />
                ))}
              </View>
            </View>
            <View className="flex-row gap-2">
              <Pressable onPress={() => onAccept(offer.id)} className="flex-1 bg-emerald-600 py-2.5 rounded-xl items-center">
                <Text className="text-white font-black text-xs uppercase tracking-wide">Aceitar</Text>
              </Pressable>
              <Pressable onPress={() => onReject(offer.id)} className="flex-1 bg-slate-800 border border-slate-700 py-2.5 rounded-xl items-center">
                <Text className="text-slate-300 font-black text-xs uppercase tracking-wide">Recusar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const TradeCenter: React.FC<TradeCenterProps> = ({ teams, players, userTeamId, gamesPlayed, currentDraft, onTradeExecute, offers, onAcceptOffer, onRejectOffer }) => {
  const { accent } = useTheme();
  const userTeam = useMemo(() => teams.find((t) => t.id === userTeamId) || null, [teams, userTeamId]);
  const [partnerTeamId, setPartnerTeamId] = useState<string | null>(null);
  const partnerTeam = useMemo(() => teams.find((t) => t.id === partnerTeamId) || null, [teams, partnerTeamId]);
  const [userAssets, setUserAssets] = useState<string[]>([]);
  const [partnerAssets, setPartnerAssets] = useState<string[]>([]);
  const [userPickIds, setUserPickIds] = useState<string[]>([]);
  const [partnerPickIds, setPartnerPickIds] = useState<string[]>([]);
  // Protection the user is attaching to their OWN outgoing picks, by pick id.
  const [protections, setProtections] = useState<{ [pickId: string]: number }>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<'idle' | 'accepted' | 'rejected'>('idle');
  const [aiResponse, setAiResponse] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [inspecting, setInspecting] = useState<Player | null>(null);

  useEffect(() => { setUserAssets([]); setUserPickIds([]); setProtections({}); }, [userTeamId]);

  const toggleAsset = useCallback((pId: string, type: 'user' | 'partner') => {
    const setter = type === 'user' ? setUserAssets : setPartnerAssets;
    setter((prev) => (prev.includes(pId) ? prev.filter((id) => id !== pId) : [...prev, pId]));
  }, []);

  const togglePick = useCallback((pickId: string, type: 'user' | 'partner') => {
    const setter = type === 'user' ? setUserPickIds : setPartnerPickIds;
    setter((prev) => (prev.includes(pickId) ? prev.filter((id) => id !== pickId) : [...prev, pickId]));
    // Dropping a pick from the package drops its protection with it, or a stale
    // flag would ride along the next time it's selected.
    if (type === 'user') {
      setProtections((prev) => {
        if (!prev[pickId]) return prev;
        const next = { ...prev };
        delete next[pickId];
        return next;
      });
    }
  }, []);

  // One meaningful protection level rather than a slider: top-5 is the classic
  // "you get it unless it's a real lottery pick" clause.
  const toggleProtection = useCallback((pickId: string) => {
    setProtections((prev) => {
      const next = { ...prev };
      if (next[pickId]) delete next[pickId];
      else next[pickId] = 5;
      return next;
    });
  }, []);

  const selectedPicks = useMemo(() => {
    const own = userTeam ? picksOf(userTeam).filter((p) => userPickIds.includes(p.id)) : [];
    return {
      give: own.map((p) => (protections[p.id] ? { ...p, protection: protections[p.id] } : p)),
      receive: partnerTeam ? picksOf(partnerTeam).filter((p) => partnerPickIds.includes(p.id)) : [],
    };
  }, [userTeam, partnerTeam, userPickIds, partnerPickIds, protections]);

  const legality = useMemo(() => {
    if (gamesPlayed >= TRADE_DEADLINE_GAME) {
      return { legal: false, reason: 'O prazo de trocas da temporada já passou. Volte na próxima temporada.' };
    }
    if (!userTeam || !partnerTeam) return null;
    if (userAssets.length + userPickIds.length === 0 || partnerAssets.length + partnerPickIds.length === 0) return null;
    return evaluateTradeLegality(userTeam, userAssets, partnerTeam, partnerAssets, players, gamesPlayed, userPickIds.length, partnerPickIds.length);
  }, [userTeam, partnerTeam, userAssets, partnerAssets, userPickIds, partnerPickIds, players, gamesPlayed]);

  // Informational read from the USER's side (distinct from the AI partner's
  // accept/reject call, which has its own leniency bias).
  const userValueEval = useMemo(() => {
    if (!userTeam || !partnerTeam) return null;
    if (userAssets.length + userPickIds.length === 0 || partnerAssets.length + partnerPickIds.length === 0) return null;
    return evaluateTradeValue(userTeam, userAssets, partnerAssets, players, {
      teams, currentDraft, givePicks: selectedPicks.give, receivePicks: selectedPicks.receive,
    });
  }, [userTeam, partnerTeam, userAssets, partnerAssets, userPickIds, partnerPickIds, players, teams, currentDraft, selectedPicks]);

  const valuePct = userValueEval && userValueEval.givesValue > 0
    ? Math.round((userValueEval.receivesValue / userValueEval.givesValue - 1) * 100)
    : 0;
  const valueVerdict = valuePct > 5 ? 'ganhando' : valuePct < -5 ? 'perdendo' : 'equilibrada';

  const executeTrade = useCallback(async () => {
    if (!userTeam || !partnerTeam || !legality?.legal) return;
    const userPlayerDetails = userAssets.map((pId) => players[pId]);
    const partnerPlayerDetails = partnerAssets.map((pId) => players[pId]);

    // Accept/reject is decided deterministically from asset value — the LLM
    // only narrates afterwards, so the outcome never depends on the model. Note
    // the sides flip here: the partner gives what the user receives.
    const valueEval = evaluateTradeValue(partnerTeam, partnerAssets, userAssets, players, {
      teams, currentDraft, givePicks: selectedPicks.receive, receivePicks: selectedPicks.give,
    });
    const accepted = valueEval.accepted;

    setTradeStatus(accepted ? 'accepted' : 'rejected');
    setAiResponse('');
    setIsLoading(true);
    if (accepted) {
      onTradeExecute(userTeam.id, partnerTeam.id, userAssets, partnerAssets, userPickIds, partnerPickIds, protections);
      setUserAssets([]);
      setPartnerAssets([]);
      setUserPickIds([]);
      setPartnerPickIds([]);
      setProtections({});
    }

    // Picks read as their own line items so the GM's reaction can talk about
    // future capital, which is half the point of trading them.
    const describePicks = (picks: DraftPickAsset[]) =>
      picks.map((p) => `pick de 1ª rodada do ${teams.find((t) => t.id === p.originalTeamId)?.name ?? p.originalTeamId}${p.protection ? ` (top ${p.protection} protegido)` : ''}`);
    const offerParts = [...userPlayerDetails.map((p) => `${p.name} (${p.ovr})`), ...describePicks(selectedPicks.give)];
    const askParts = [...partnerPlayerDetails.map((p) => `${p.name} (${p.ovr})`), ...describePicks(selectedPicks.receive)];

    const prompt = `Você é o General Manager do ${partnerTeam.name}. Seu time tem um estilo de jogo focado em '${partnerTeam.style}' e está ${partnerTeam.powerRank <= 10 ? 'competindo pelo título' : partnerTeam.powerRank <= 20 ? 'buscando uma vaga nos playoffs' : 'em reconstrução'}.
Você recebeu a seguinte proposta de troca do ${userTeam.name} e já decidiu ${accepted ? 'ACEITAR' : 'RECUSAR'}:
O ${userTeam.name} oferece: ${offerParts.join(', ')}
Em troca de: ${askParts.join(', ')}
Escreva de 2 a 3 frases, em primeira pessoa e no seu personagem de GM, explicando por que você ${accepted ? 'topou' : 'recusou'} essa troca. Não repita a palavra ACEITAR/RECUSAR nem cite números — só a justificativa.`;

    // Deterministic in-world reaction for when Gemini is down/rate-limited.
    const localReaction = (() => {
      const situation = partnerTeam.powerRank <= 10 ? 'contender' : partnerTeam.powerRank <= 20 ? 'bubble' : 'rebuild';
      const incoming = userPlayerDetails.map((p) => p.name).join(' e ');
      const outgoing = partnerPlayerDetails.map((p) => p.name).join(' e ');
      const accepts: Record<string, string[]> = {
        contender: [
          `${incoming} nos dá exatamente a peça que faltava pra brigar pelo título agora. Abrir mão de ${outgoing} dói, mas a janela é essa.`,
          `Estamos em modo "vencer já", e ${incoming} eleva nosso teto. Foi um preço que valeu a pena pagar.`,
        ],
        bubble: [
          `Precisávamos de reforço pra garantir os playoffs, e ${incoming} encaixa no nosso plano. Boa troca pros dois lados.`,
          `${incoming} nos deixa mais competitivos no curto prazo sem comprometer o vestiário. Topamos.`,
        ],
        rebuild: [
          `Faz sentido pro nosso projeto de reconstrução: ${incoming} soma ao que estamos montando pro futuro.`,
          `Estamos pensando no longo prazo, e receber ${incoming} por ${outgoing} nos dá flexibilidade. Fechado.`,
        ],
      };
      const rejects: Record<string, string[]> = {
        contender: [
          `Não posso mexer no nosso núcleo agora — ${outgoing} é importante demais pra nossa corrida pelo título. Vou passar.`,
          `Com o time brigando lá em cima, abrir mão de ${outgoing} por ${incoming} não nos torna melhores. Recuso.`,
        ],
        bubble: [
          `Gosto de ${incoming}, mas não o suficiente pra desfalcar o time nessa altura da temporada. Fica pra próxima.`,
          `A conta não fecha pro nosso momento: perder ${outgoing} agora nos atrapalha mais do que ajuda.`,
        ],
        rebuild: [
          `${outgoing} faz parte do nosso futuro — não vou trocá-lo por ${incoming} sem uma oferta bem melhor.`,
          `Estamos construindo com paciência. Essa proposta não acelera nada pra gente. Vou recusar.`,
        ],
      };
      const pool = (accepted ? accepts : rejects)[situation];
      return pool[Math.floor(Math.random() * pool.length)];
    })();

    const result = await generateAnalysis(prompt, localReaction);
    setAiResponse(result.trim());
    setIsLoading(false);
  }, [userTeam, partnerTeam, userAssets, partnerAssets, userPickIds, partnerPickIds, protections, selectedPicks, teams, currentDraft, players, legality, onTradeExecute]);

  const canPropose = !!legality?.legal && !isLoading;

  return (
    <ScrollView className="flex-1">
      <View className="px-4 py-6 gap-6">
        <OffersInbox offers={offers} teams={teams} players={players} currentDraft={currentDraft} onAccept={onAcceptOffer} onReject={onRejectOffer} onSelectPlayer={setInspecting} accent={accent.primary} />

        <TeamPanel
          title="Seu Time" team={userTeam} assets={userAssets} incomingAssets={partnerAssets} players={players}
          onToggleAsset={(p) => toggleAsset(p, 'user')} locked accent={accent.primary}
          teams={teams} currentDraft={currentDraft} pickIds={userPickIds} protections={protections}
          onTogglePick={(id) => togglePick(id, 'user')} onToggleProtection={toggleProtection}
        />
        <TeamPanel
          title="Parceiro de Troca" team={partnerTeam} onOpenPicker={() => setPickerOpen(true)} assets={partnerAssets}
          incomingAssets={userAssets} players={players} onToggleAsset={(p) => toggleAsset(p, 'partner')} accent={accent.primary}
          teams={teams} currentDraft={currentDraft} pickIds={partnerPickIds} protections={{}}
          onTogglePick={(id) => togglePick(id, 'partner')}
        />

        {legality && !legality.legal ? (
          <View className="bg-red-950/40 border border-red-900 rounded-2xl px-5 py-3">
            <Text className="text-xs font-bold text-red-400 text-center">{legality.reason}</Text>
          </View>
        ) : null}

        {!pendingConfirm ? (
          <Pressable
            onPress={() => setPendingConfirm(true)}
            disabled={!canPropose}
            className={`bg-white py-4 rounded-full items-center ${!canPropose ? 'opacity-20' : ''}`}
          >
            <Text className="text-black text-lg font-black">PROPOR TROCA</Text>
          </Pressable>
        ) : (
          <Card hero padding="lg" className="items-center gap-3">
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Avaliação da Troca</Text>
            <Text className={`text-2xl font-black italic uppercase tracking-tighter text-center ${valueVerdict === 'ganhando' ? 'text-emerald-400' : valueVerdict === 'perdendo' ? 'text-red-500' : 'text-slate-300'}`}>
              {valueVerdict === 'ganhando' ? `VOCÊ ESTÁ GANHANDO (+${valuePct}%)` : valueVerdict === 'perdendo' ? `VOCÊ ESTÁ PERDENDO (${valuePct}%)` : 'TROCA EQUILIBRADA'}
            </Text>
            <Text className="text-slate-500 text-xs text-center">
              Comparação de valor (rating × idade) entre o que você envia e o que recebe. A decisão é sua.
            </Text>
            <View className="flex-row gap-3 pt-1">
              <Pressable onPress={() => setPendingConfirm(false)} className="bg-slate-800 px-6 py-3 rounded-full">
                <Text className="text-white font-bold">CANCELAR</Text>
              </Pressable>
              <Pressable onPress={() => { setPendingConfirm(false); executeTrade(); }} disabled={!canPropose} className={`bg-white px-6 py-3 rounded-full ${!canPropose ? 'opacity-20' : ''}`}>
                <Text className="text-black font-black">CONFIRMAR</Text>
              </Pressable>
            </View>
          </Card>
        )}

        {tradeStatus !== 'idle' ? (
          <Card hero padding="lg" className="items-center gap-3" style={tradeStatus === 'accepted' ? { borderColor: accent.primary } : undefined}>
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Resposta do GM</Text>
            <Text className={`text-3xl font-black italic uppercase tracking-tighter ${tradeStatus === 'accepted' ? 'text-green-500' : 'text-red-500'}`}>
              {tradeStatus === 'accepted' ? 'ACEITO!' : 'REJEITADO!'}
            </Text>
            {isLoading ? (
              <View className="flex-row items-center gap-3 py-2">
                <ActivityIndicator size="small" color={accent.primary} />
                <Text className="text-xs font-bold text-slate-500 uppercase tracking-widest">Carregando reação do GM...</Text>
              </View>
            ) : (
              <Text className="text-slate-400 italic text-center leading-5">"{aiResponse}"</Text>
            )}
          </Card>
        ) : null}
      </View>

      {/* Partner team picker */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 bg-black/70 justify-end" onPress={() => setPickerOpen(false)}>
          <Pressable className="bg-slate-950 border-t border-slate-800 rounded-t-3xl p-4 max-h-[70%]" onPress={(e) => e.stopPropagation()}>
            <View className="w-10 h-1 bg-slate-700 rounded-full self-center mb-4" />
            <Text className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Escolha o parceiro</Text>
            <ScrollView>
              {teams.filter((t) => t.id !== userTeamId).map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => { setPartnerTeamId(t.id); setPartnerAssets([]); setPartnerPickIds([]); setPickerOpen(false); }}
                  className="flex-row items-center gap-3 p-3 rounded-xl active:bg-slate-900"
                >
                  <Image source={{ uri: getTeamLogoUrl(t) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 28, height: 28 }} contentFit="contain" />
                  <Text className="text-sm font-bold text-white">{t.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {inspecting ? <PlayerDetailModal player={inspecting} onClose={() => setInspecting(null)} /> : null}
    </ScrollView>
  );
};

export default TradeCenter;
