import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Team, Player, TradeOffer, DraftPickAsset } from '../types';
import {
  getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getTeamSalary, SALARY_CAP,
  formatPositions, getPlayerPositions, picksOf, getTeamNickname, getTeamTricode, attributeColor,
} from '../constants';
import {
  evaluateTradeLegality, evaluateTradeValue, TRADE_DEADLINE_GAME, playerValue, picksValue,
} from '../services/tradeService';
import { projectedPickSlot } from '../services/draftService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import {
  Panel, Well, MonoLabel, Eyebrow, HeroTitle, Stat, Chip, CtaButton, GhostButton, FilterRow,
} from '../components/ui/kit';
import Icon from '../components/Icon';
import PlayerDetailModal from '../components/PlayerDetailModal';

// Design 2b — the value scale is the hero of this screen. The old version made
// you build a package blind and only told you afterwards (via a confirm dialog)
// whether it was any good; here the balance, the salary match and the roster
// minimum are all live as you build, so nothing is a surprise after the tap.
//
// The full rosters moved into a picker sheet for the same reason: what belongs
// on the screen is the DEAL, not two 15-man lists.

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
const POSITION_FILTERS = [
  { id: 'TODOS', label: 'Todos' }, { id: 'PG', label: 'PG' }, { id: 'SG', label: 'SG' },
  { id: 'SF', label: 'SF' }, { id: 'PF', label: 'PF' }, { id: 'C', label: 'C' },
];
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

/* -------------------------------------------------------------------------- */

const AssetRow: React.FC<{ label: string; sub: string; ovr?: number; onRemove?: () => void; icon?: React.ReactNode }> = ({
  label, sub, ovr, onRemove, icon,
}) => (
  <Well padding={9} className="flex-row items-center" style={{ gap: 10 }}>
    {icon}
    <View style={{ flex: 1 }}>
      <Text className="font-bold text-white" style={{ fontSize: 12 }} numberOfLines={1}>{label}</Text>
      <MonoLabel size={9.5} color={INK.meta} style={{ letterSpacing: 0, marginTop: 2 }} numberOfLines={1}>{sub}</MonoLabel>
    </View>
    {ovr !== undefined ? <Stat size={15} color={attributeColor(ovr)}>{ovr}</Stat> : <Stat size={15} color={COLORS.warn}>—</Stat>}
    {onRemove ? (
      <Pressable onPress={onRemove} hitSlop={10} className="active:opacity-60">
        <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 18 }}>×</Text>
      </Pressable>
    ) : null}
  </Well>
);

/** One side of the package: what's in it, and a way to add more. */
const PackagePanel: React.FC<{
  title: string;
  titleColor: string;
  team: Team | null;
  playerIds: string[];
  pickIds: string[];
  players: { [key: string]: Player };
  teams: Team[];
  protections: { [pickId: string]: number };
  onRemovePlayer: (id: string) => void;
  onRemovePick: (id: string) => void;
  onAdd?: () => void;
  emptyHint: string;
}> = ({
  title, titleColor, team, playerIds, pickIds, players, teams, protections,
  onRemovePlayer, onRemovePick, onAdd, emptyHint,
}) => {
  const picks = team ? picksOf(team).filter((p) => pickIds.includes(p.id)) : [];
  const total = playerIds.reduce((s, id) => s + (players[id]?.salary ?? 0), 0);

  return (
    <Panel padding={13}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
        <MonoLabel color={titleColor}>{title}</MonoLabel>
        {playerIds.length > 0 ? (
          <MonoLabel size={9.5} color={INK.meta} style={{ letterSpacing: 0 }}>{money(total)}</MonoLabel>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        {playerIds.map((id) => {
          const p = players[id];
          if (!p) return null;
          return (
            <AssetRow
              key={id}
              label={p.name}
              sub={`${formatPositions(p)} · ${money(p.salary)}`}
              ovr={p.ovr}
              onRemove={() => onRemovePlayer(id)}
              icon={
                <Image
                  source={{ uri: getPlayerImageUrl(p) }}
                  placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                  style={{ width: 30, height: 30, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                  contentFit="cover"
                />
              }
            />
          );
        })}

        {picks.map((pick) => {
          const slot = projectedPickSlot(pick.originalTeamId, teams);
          const prot = protections[pick.id];
          return (
            <AssetRow
              key={pick.id}
              label={`1ª rodada ${pick.originalTeamId.toUpperCase()}`}
              sub={`Projetada ~#${slot + 1}${prot ? ` · top ${prot} protegida` : ''}`}
              onRemove={() => onRemovePick(pick.id)}
              icon={
                <View
                  style={{
                    width: 30, height: 30, borderRadius: RADIUS.control, backgroundColor: COLORS.line,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <MonoLabel size={9} color={COLORS.warn} style={{ letterSpacing: 0 }}>1ª</MonoLabel>
                </View>
              }
            />
          );
        })}

        {playerIds.length + picks.length === 0 ? (
          <Text style={{ fontSize: 11, color: INK.faint, fontStyle: 'italic' }}>{emptyHint}</Text>
        ) : null}
      </View>

      {onAdd ? (
        <GhostButton label="+ Adicionar" onPress={onAdd} padding={9} size={10.5} style={{ marginTop: 10 }} />
      ) : null}
    </Panel>
  );
};

/* -------------------------------------------------------------------------- */

const TradeCenter: React.FC<TradeCenterProps> = ({
  teams, players, userTeamId, gamesPlayed, currentDraft, onTradeExecute, offers, onAcceptOffer, onRejectOffer,
}) => {
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
  const [assetSheet, setAssetSheet] = useState<'user' | 'partner' | null>(null);
  const [tradeStatus, setTradeStatus] = useState<'idle' | 'accepted' | 'rejected'>('idle');
  const [gmReaction, setGmReaction] = useState('');
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

  const hasPackage = userAssets.length + userPickIds.length > 0 && partnerAssets.length + partnerPickIds.length > 0;

  const legality = useMemo(() => {
    if (gamesPlayed >= TRADE_DEADLINE_GAME) {
      return { legal: false, reason: 'O prazo de trocas da temporada já passou. Volte na próxima temporada.' };
    }
    if (!userTeam || !partnerTeam || !hasPackage) return null;
    return evaluateTradeLegality(userTeam, userAssets, partnerTeam, partnerAssets, players, gamesPlayed, userPickIds.length, partnerPickIds.length);
  }, [userTeam, partnerTeam, userAssets, partnerAssets, userPickIds, partnerPickIds, players, gamesPlayed, hasPackage]);

  // Informational read from the USER's side (distinct from the partner's
  // accept/reject call below, which has its own leniency bias).
  const userValueEval = useMemo(() => {
    if (!userTeam || !partnerTeam || !hasPackage) return null;
    return evaluateTradeValue(userTeam, userAssets, partnerAssets, players, {
      teams, currentDraft, givePicks: selectedPicks.give, receivePicks: selectedPicks.receive,
    });
  }, [userTeam, partnerTeam, userAssets, partnerAssets, players, teams, currentDraft, selectedPicks, hasPackage]);

  // The same call the CPU will actually make when the trade is proposed, run
  // live so the balance meter is a prediction and not a post-hoc explanation.
  const partnerEval = useMemo(() => {
    if (!userTeam || !partnerTeam || !hasPackage) return null;
    return evaluateTradeValue(partnerTeam, partnerAssets, userAssets, players, {
      teams, currentDraft, givePicks: selectedPicks.receive, receivePicks: selectedPicks.give,
    });
  }, [userTeam, partnerTeam, userAssets, partnerAssets, players, teams, currentDraft, selectedPicks, hasPackage]);

  const valuePct = userValueEval && userValueEval.givesValue > 0
    ? Math.round((userValueEval.receivesValue / userValueEval.givesValue - 1) * 100)
    : 0;

  // The scale reads from the PARTNER's side — left is "they refuse", right is
  // "you're overpaying" — which is the question you're actually asking it.
  const markerPos = Math.max(0.03, Math.min(0.97, 0.5 - valuePct / 120));

  const executeTrade = useCallback(() => {
    if (!userTeam || !partnerTeam || !legality?.legal || !partnerEval) return;
    const userPlayerDetails = userAssets.map((pId) => players[pId]);
    const partnerPlayerDetails = partnerAssets.map((pId) => players[pId]);

    // Accept/reject is decided deterministically from asset value — the
    // reaction only narrates afterwards, so the outcome never depends on it.
    const accepted = partnerEval.accepted;

    setTradeStatus(accepted ? 'accepted' : 'rejected');
    if (accepted) {
      onTradeExecute(userTeam.id, partnerTeam.id, userAssets, partnerAssets, userPickIds, partnerPickIds, protections);
      setUserAssets([]);
      setPartnerAssets([]);
      setUserPickIds([]);
      setPartnerPickIds([]);
      setProtections({});
    }

    // The opposing GM's answer, written here rather than generated. This used
    // to be an LLM call through a proxy, with these lines as the offline
    // fallback; the call cost up to three 12s attempts before timing out, so
    // the answer to a trade you just proposed regularly took half a minute to
    // arrive — for two sentences of flavor. The lines below know the partner's
    // competitive situation and name the actual players moving, which is the
    // part that carried the meaning anyway, and they land instantly.
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
    setGmReaction(pool[Math.floor(Math.random() * pool.length)]);
  }, [userTeam, partnerTeam, userAssets, partnerAssets, userPickIds, partnerPickIds, protections, players, legality, partnerEval, onTradeExecute]);

  const canPropose = !!legality?.legal;
  const outgoingCount = userAssets.length + userPickIds.length;
  const incomingCount = partnerAssets.length + partnerPickIds.length;

  return (
    <Screen
      heroHeight={150}
      footer={
        <CtaButton
          label="Propor troca"
          sub={hasPackage ? `${outgoingCount} saem · ${incomingCount} entram` : 'Monte os dois lados do pacote'}
          onPress={executeTrade}
          disabled={!canPropose}
        />
      }
    >
      <HeroContent>
        <Eyebrow>Central de trocas</Eyebrow>
        <View className="flex-row items-center justify-between" style={{ marginTop: 12 }}>
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <Image source={{ uri: getTeamLogoUrl(userTeam ?? undefined) }} style={{ width: 36, height: 36 }} contentFit="contain" />
            <HeroTitle size={17}>{getTeamTricode(userTeam ?? undefined)}</HeroTitle>
          </View>
          <HeroTitle size={15} color="rgba(255,255,255,0.4)">⇄</HeroTitle>
          <Pressable
            onPress={() => setPickerOpen(true)}
            className="flex-row items-center active:opacity-70"
            style={{
              gap: 9, backgroundColor: 'rgba(0,0,0,0.35)', paddingLeft: 8, paddingRight: 11, paddingVertical: 6,
              borderRadius: RADIUS.control, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
            }}
          >
            {partnerTeam ? (
              <Image source={{ uri: getTeamLogoUrl(partnerTeam) }} style={{ width: 26, height: 26 }} contentFit="contain" />
            ) : null}
            <Text className="font-extrabold text-white" style={{ fontSize: 12 }}>
              {partnerTeam ? getTeamNickname(partnerTeam) : 'Escolher time'}
            </Text>
            <Icon name="chevron-down" size={13} color="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>
      </HeroContent>

      <Body top={16}>
        <PackagePanel
          title="Você envia"
          titleColor={COLORS.info}
          team={userTeam}
          playerIds={userAssets}
          pickIds={userPickIds}
          players={players}
          teams={teams}
          protections={protections}
          onRemovePlayer={(id) => toggleAsset(id, 'user')}
          onRemovePick={(id) => togglePick(id, 'user')}
          onAdd={() => setAssetSheet('user')}
          emptyHint="Escolha jogadores ou picks para enviar."
        />

        <PackagePanel
          title="Você recebe"
          titleColor={COLORS.badSoft}
          team={partnerTeam}
          playerIds={partnerAssets}
          pickIds={partnerPickIds}
          players={players}
          teams={teams}
          protections={{}}
          onRemovePlayer={(id) => toggleAsset(id, 'partner')}
          onRemovePick={(id) => togglePick(id, 'partner')}
          onAdd={partnerTeam ? () => setAssetSheet('partner') : undefined}
          emptyHint={partnerTeam ? 'Escolha o que pedir em troca.' : 'Selecione um parceiro de troca primeiro.'}
        />

        {/* The balance. */}
        <Panel padding={14}>
          <View className="flex-row justify-between items-baseline" style={{ marginBottom: 11 }}>
            <MonoLabel>Balança de valor</MonoLabel>
            {partnerEval ? (
              <MonoLabel size={10} color={partnerEval.accepted ? COLORS.goodSoft : COLORS.badSoft} style={{ letterSpacing: 0.6 }}>
                {getTeamNickname(partnerTeam ?? undefined)} {partnerEval.accepted ? 'aceitam' : 'recusam'}
              </MonoLabel>
            ) : (
              <MonoLabel size={10} color={INK.faint} style={{ letterSpacing: 0.6 }}>Aguardando pacote</MonoLabel>
            )}
          </View>

          <View style={{ height: 9, borderRadius: RADIUS.pill, overflow: 'visible', justifyContent: 'center' }}>
            <LinearGradient
              colors={[COLORS.cta, COLORS.warn, COLORS.good]}
              locations={[0, 0.42, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: 9, borderRadius: RADIUS.pill, opacity: hasPackage ? 1 : 0.3 }}
            />
            {hasPackage ? (
              <View
                style={{
                  position: 'absolute', left: `${markerPos * 100}%`, width: 4, height: 19, marginLeft: -2,
                  borderRadius: 2, backgroundColor: '#fff',
                }}
              />
            ) : null}
          </View>
          <View className="flex-row justify-between" style={{ marginTop: 8 }}>
            <MonoLabel size={9.5} color={INK.faint} style={{ letterSpacing: 0 }}>Recusa</MonoLabel>
            <MonoLabel size={9.5} color={INK.faint} style={{ letterSpacing: 0 }}>Justo</MonoLabel>
            <MonoLabel size={9.5} color={INK.faint} style={{ letterSpacing: 0 }}>Generoso</MonoLabel>
          </View>

          {/* Salary match / roster minimum / deadline, as live warnings rather
              than an error after the tap. */}
          <View className="flex-row flex-wrap" style={{ gap: 7, marginTop: 12 }}>
            {legality ? (
              <Chip tone={legality.legal ? 'good' : 'bad'} size={9.5}>
                {legality.legal ? 'Salários batem' : legality.reason}
              </Chip>
            ) : null}
            {hasPackage && userValueEval ? (
              <Chip tone={valuePct > 5 ? 'good' : valuePct < -5 ? 'warn' : 'neutral'} size={9.5}>
                {valuePct > 5 ? `Você ganha ${valuePct}%` : valuePct < -5 ? `Você perde ${Math.abs(valuePct)}%` : 'Valor equilibrado'}
              </Chip>
            ) : null}
            {userTeam && outgoingCount > 0 ? (
              <Chip tone="neutral" size={9.5}>
                Elenco fica com {userTeam.roster.length - userAssets.length + partnerAssets.length}
              </Chip>
            ) : null}
          </View>
        </Panel>

        {/* Protections, only once there's an outgoing pick to protect. */}
        {userTeam && userPickIds.length > 0 ? (
          <Panel padding={13}>
            <MonoLabel style={{ marginBottom: 9 }}>Proteção das suas picks</MonoLabel>
            <View style={{ gap: 8 }}>
              {picksOf(userTeam).filter((p) => userPickIds.includes(p.id)).map((pick) => (
                <Well key={pick.id} padding={9} className="flex-row items-center justify-between">
                  <Text className="font-bold text-white" style={{ fontSize: 11.5 }}>
                    1ª rodada {pick.originalTeamId.toUpperCase()} · draft {pick.draft}
                  </Text>
                  <Pressable
                    onPress={() => toggleProtection(pick.id)}
                    className="active:opacity-70"
                    style={{
                      paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8,
                      backgroundColor: protections[pick.id] ? withAlpha(COLORS.warn, 0.2) : COLORS.line,
                    }}
                  >
                    <MonoLabel size={8.5} color={protections[pick.id] ? COLORS.warn : COLORS.textDim}>
                      {protections[pick.id] ? `Top ${protections[pick.id]}` : 'Proteger'}
                    </MonoLabel>
                  </Pressable>
                </Well>
              ))}
            </View>
          </Panel>
        ) : null}

        {/* GM reaction */}
        {tradeStatus !== 'idle' ? (
          <Panel bar={tradeStatus === 'accepted' ? COLORS.good : COLORS.cta} padding={16}>
            <MonoLabel>Resposta do GM</MonoLabel>
            <HeroTitle size={24} color={tradeStatus === 'accepted' ? COLORS.goodSoft : COLORS.badSoft} style={{ marginTop: 6 }}>
              {tradeStatus === 'accepted' ? 'Aceito!' : 'Rejeitado!'}
            </HeroTitle>
            <Text style={{ fontSize: 12, lineHeight: 18, color: COLORS.textSoft, marginTop: 10 }}>“{gmReaction}”</Text>
          </Panel>
        ) : null}

        {/* Inbox */}
        <OffersInbox
          offers={offers}
          teams={teams}
          players={players}
          currentDraft={currentDraft}
          onAccept={onAcceptOffer}
          onReject={onRejectOffer}
          onSelectPlayer={setInspecting}
        />
      </Body>

      {/* Partner picker */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Escolha o parceiro">
        {teams.filter((t) => t.id !== userTeamId).map((t) => (
          <Pressable
            key={t.id}
            onPress={() => { setPartnerTeamId(t.id); setPartnerAssets([]); setPartnerPickIds([]); setPickerOpen(false); }}
            className="flex-row items-center gap-3 p-3 rounded-xl active:opacity-70"
          >
            <Image source={{ uri: getTeamLogoUrl(t) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 28, height: 28 }} contentFit="contain" />
            <Text className="text-sm font-bold text-white">{t.name}</Text>
          </Pressable>
        ))}
      </Sheet>

      {/* Asset picker for whichever side was tapped */}
      <AssetSheet
        side={assetSheet}
        onClose={() => setAssetSheet(null)}
        team={assetSheet === 'user' ? userTeam : partnerTeam}
        players={players}
        teams={teams}
        selectedPlayers={assetSheet === 'user' ? userAssets : partnerAssets}
        selectedPicks={assetSheet === 'user' ? userPickIds : partnerPickIds}
        onTogglePlayer={(id) => assetSheet && toggleAsset(id, assetSheet)}
        onTogglePick={(id) => assetSheet && togglePick(id, assetSheet)}
        accent={accent.primary}
      />

      {inspecting ? <PlayerDetailModal player={inspecting} onClose={() => setInspecting(null)} /> : null}
    </Screen>
  );
};

/* -------------------------------------------------------------------------- */

const Sheet: React.FC<{ visible: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({
  visible, onClose, title, children,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable className="flex-1 bg-black/70 justify-end" onPress={onClose}>
      <Pressable
        className="rounded-t-3xl p-4 max-h-[76%]"
        style={{ backgroundColor: COLORS.navBg, borderTopWidth: 1, borderTopColor: COLORS.navLine }}
        onPress={(e) => e.stopPropagation()}
      >
        <View className="w-10 h-1 rounded-full self-center mb-4" style={{ backgroundColor: COLORS.line }} />
        <MonoLabel style={{ marginBottom: 10 }}>{title}</MonoLabel>
        <ScrollView>{children}</ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
);

const AssetSheet: React.FC<{
  side: 'user' | 'partner' | null;
  onClose: () => void;
  team: Team | null;
  players: { [key: string]: Player };
  teams: Team[];
  selectedPlayers: string[];
  selectedPicks: string[];
  onTogglePlayer: (id: string) => void;
  onTogglePick: (id: string) => void;
  accent: string;
}> = ({ side, onClose, team, players, teams, selectedPlayers, selectedPicks, onTogglePlayer, onTogglePick, accent }) => {
  const [pos, setPos] = useState('TODOS');
  if (!side || !team) return <Sheet visible={false} onClose={onClose} title="">{null}</Sheet>;

  const roster = team.roster
    .map((id) => players[id])
    .filter((p): p is Player => !!p && (pos === 'TODOS' || getPlayerPositions(p).includes(pos)))
    .sort((a, b) => b.ovr - a.ovr);
  const picks = [...picksOf(team)].sort((a, b) => a.draft - b.draft);

  return (
    <Sheet visible onClose={onClose} title={side === 'user' ? 'O que você envia' : `O que pedir ao ${getTeamNickname(team)}`}>
      <FilterRow items={POSITION_FILTERS} value={pos} onChange={setPos} style={{ marginBottom: 12 }} />

      <View style={{ gap: 8 }}>
        {roster.map((p) => {
          const on = selectedPlayers.includes(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => onTogglePlayer(p.id)}
              className="flex-row items-center active:opacity-75"
              style={{
                gap: 10, padding: 10, borderRadius: RADIUS.control,
                backgroundColor: on ? withAlpha(accent, 0.2) : COLORS.panel,
                borderWidth: 1, borderColor: on ? accent : COLORS.line,
              }}
            >
              <Image
                source={{ uri: getPlayerImageUrl(p) }}
                placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                style={{ width: 32, height: 32, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text className="font-bold text-white" style={{ fontSize: 12 }} numberOfLines={1}>{p.name}</Text>
                <MonoLabel size={9.5} color={INK.meta} style={{ letterSpacing: 0, marginTop: 2 }}>
                  {formatPositions(p)} · {money(p.salary)}
                </MonoLabel>
              </View>
              <Stat size={15} color={attributeColor(p.ovr)}>{p.ovr}</Stat>
            </Pressable>
          );
        })}
        {roster.length === 0 ? (
          <Text style={{ fontSize: 11, color: INK.faint, fontStyle: 'italic' }}>Nenhum jogador nessa posição.</Text>
        ) : null}

        {picks.length > 0 ? (
          <>
            <MonoLabel style={{ marginTop: 10 }}>Escolhas de 1ª rodada</MonoLabel>
            {picks.map((pick) => {
              const on = selectedPicks.includes(pick.id);
              const slot = projectedPickSlot(pick.originalTeamId, teams);
              return (
                <Pressable
                  key={pick.id}
                  onPress={() => onTogglePick(pick.id)}
                  className="flex-row items-center active:opacity-75"
                  style={{
                    gap: 10, padding: 10, borderRadius: RADIUS.control,
                    backgroundColor: on ? withAlpha(accent, 0.2) : COLORS.panel,
                    borderWidth: 1, borderColor: on ? accent : COLORS.line,
                  }}
                >
                  <View
                    style={{
                      width: 32, height: 32, borderRadius: RADIUS.control, backgroundColor: COLORS.line,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MonoLabel size={9} color={COLORS.warn} style={{ letterSpacing: 0 }}>1ª</MonoLabel>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="font-bold text-white" style={{ fontSize: 12 }}>
                      1ª rodada {pick.originalTeamId.toUpperCase()}
                    </Text>
                    <MonoLabel size={9.5} color={INK.meta} style={{ letterSpacing: 0, marginTop: 2 }}>
                      Draft {pick.draft} · projetada ~#{slot + 1}
                    </MonoLabel>
                  </View>
                </Pressable>
              );
            })}
          </>
        ) : null}
      </View>

      <GhostButton label="Pronto" onPress={onClose} style={{ marginTop: 14, marginBottom: 8 }} />
    </Sheet>
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
}> = ({ offers, teams, players, currentDraft, onAccept, onReject, onSelectPlayer }) => {
  if (offers.length === 0) return null;
  const named = (ids: string[]) => ids.map((id) => players[id]).filter(Boolean);

  return (
    <Panel padding={13}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
        <MonoLabel>Ofertas recebidas</MonoLabel>
        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.pill, backgroundColor: COLORS.cta }}>
          <MonoLabel size={9} color="#fff" style={{ letterSpacing: 0 }}>{offers.length}</MonoLabel>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {offers.map((offer) => {
          const from = teams.find((t) => t.id === offer.fromTeamId);
          const give = named(offer.requestIds);
          const get = named(offer.offerIds);
          // Picks the CPU throws in count toward the verdict, or a pick-heavy
          // offer would read as "perdendo" no matter how good it is.
          const offeredPicks = from ? picksOf(from).filter((p) => (offer.offerPickIds ?? []).includes(p.id)) : [];
          const giveVal = give.reduce((s, p) => s + playerValue(p), 0);
          const getVal = get.reduce((s, p) => s + playerValue(p), 0) + picksValue(offeredPicks, teams, currentDraft);
          const ratio = giveVal > 0 ? getVal / giveVal : 1;
          const verdict = ratio >= 1.05
            ? { t: 'Ganhando', c: COLORS.goodSoft }
            : ratio >= 0.95
              ? { t: 'Equilibrada', c: COLORS.textSoft }
              : { t: 'Perdendo', c: COLORS.badSoft };

          return (
            <Well key={offer.id} padding={11} style={{ gap: 9 }}>
              <View className="flex-row items-center" style={{ gap: 9 }}>
                {from ? (
                  <Image source={{ uri: getTeamLogoUrl(from) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 24, height: 24 }} contentFit="contain" />
                ) : null}
                <Text className="font-bold text-white" style={{ fontSize: 11.5, flex: 1 }} numberOfLines={1}>
                  {getTeamNickname(from)} propõem
                </Text>
                <MonoLabel size={9.5} color={verdict.c} style={{ letterSpacing: 0.4 }}>{verdict.t}</MonoLabel>
              </View>

              <OfferSide label="Você cede" color={COLORS.badSoft} list={give} onSelect={onSelectPlayer} />
              <OfferSide label="Você recebe" color={COLORS.goodSoft} list={get} onSelect={onSelectPlayer} extra={offeredPicks.length} />

              <View className="flex-row" style={{ gap: 8 }}>
                <GhostButton label="Recusar" onPress={() => onReject(offer.id)} padding={9} size={10.5} style={{ flex: 1 }} />
                <Pressable
                  onPress={() => onAccept(offer.id)}
                  className="active:opacity-80"
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 16,
                    backgroundColor: withAlpha(COLORS.good, 0.18), borderWidth: 1, borderColor: withAlpha(COLORS.good, 0.4),
                  }}
                >
                  <Text className="font-black" style={{ fontSize: 10.5, color: COLORS.goodSoft, textTransform: 'uppercase' }}>
                    Aceitar
                  </Text>
                </Pressable>
              </View>
            </Well>
          );
        })}
      </View>
    </Panel>
  );
};

const OfferSide: React.FC<{
  label: string;
  color: string;
  list: Player[];
  onSelect: (p: Player) => void;
  extra?: number;
}> = ({ label, color, list, onSelect, extra }) => (
  <View style={{ gap: 6 }}>
    <MonoLabel size={8.5} color={color}>{label}</MonoLabel>
    <View className="flex-row flex-wrap" style={{ gap: 6 }}>
      {list.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onSelect(p)}
          className="flex-row items-center active:opacity-70"
          style={{
            gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9,
            backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line,
          }}
        >
          <Text className="font-bold text-white" style={{ fontSize: 11 }} numberOfLines={1}>{p.name}</Text>
          <Stat size={10} color={attributeColor(p.ovr)}>{p.ovr}</Stat>
        </Pressable>
      ))}
      {extra ? (
        <View
          style={{
            paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9,
            backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line,
          }}
        >
          <MonoLabel size={9.5} color={COLORS.warn} style={{ letterSpacing: 0 }}>
            +{extra} {extra === 1 ? 'pick' : 'picks'}
          </MonoLabel>
        </View>
      ) : null}
    </View>
  </View>
);

export default TradeCenter;
