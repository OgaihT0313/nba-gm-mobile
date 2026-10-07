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
  evaluateTradeLegality, evaluateTradeValue, TRADE_DEADLINE_GAME, playerValue, picksValue, OFFER_TTL,
} from '../services/tradeService';
import { projectedPickSlot } from '../services/draftService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS, FONT, withAlpha } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import {
  Panel, Well, MonoLabel, Eyebrow, HeroTitle, Stat, Chip, CtaButton, GhostButton, FilterRow,
  ScreenTitle, Tag, TeamBadge, TeamLogo, BodyText, Name, Dock, SectionLabel,
} from '../components/ui/kit';
import Icon from '../components/Icon';
import PlayerDetailModal from '../components/PlayerDetailModal';

// Design 3a of "Transmissão" (was design 2b) — the value scale is the hero of this screen. The old version made
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
  /** Opened from a team's page ("Abrir negociação"): start with them as partner. */
  initialPartnerId?: string;
}

/* -------------------------------------------------------------------------- */

/** One asset in a package column: name, then pos · OVR · salary (or the pick's terms). */
const AssetRow: React.FC<{ label: string; sub: string; subColor?: string; onRemove?: () => void }> = ({
  label, sub, subColor, onRemove,
}) => (
  <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: 15, lineHeight: 17, color: COLORS.text }}>{label}</Text>
      <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 12, color: subColor ?? COLORS.dim }}>{sub}</Text>
    </View>
    {onRemove ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`Tirar ${label}`} onPress={onRemove} hitSlop={10} className="active:opacity-60">
        <Text style={{ fontSize: 16, color: COLORS.dim, lineHeight: 18 }}>×</Text>
      </Pressable>
    ) : null}
  </View>
);

/** One side of the package, as a column: team badge header, assets, + ADICIONAR. */
const PackagePanel: React.FC<{
  title: string;
  team: Team | null;
  playerIds: string[];
  pickIds: string[];
  players: { [key: string]: Player };
  teams: Team[];
  protections: { [pickId: string]: number };
  onRemovePlayer: (id: string) => void;
  onRemovePick: (id: string) => void;
  onAdd?: () => void;
  onSwitchTeam?: () => void;
  emptyHint: string;
}> = ({
  title, team, playerIds, pickIds, players, teams, protections,
  onRemovePlayer, onRemovePick, onAdd, onSwitchTeam, emptyHint,
}) => {
  const picks = team ? picksOf(team).filter((p) => pickIds.includes(p.id)) : [];

  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole={onSwitchTeam ? 'button' : undefined}
        onPress={onSwitchTeam}
        disabled={!onSwitchTeam}
        className="flex-row items-center"
        style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.line }}
      >
        {team ? <TeamBadge teamId={team.id} width={30} height={20} /> : <View style={{ width: 30, height: 20, borderRadius: 4, backgroundColor: COLORS.surface2 }} />}
        <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted }}>{title}</Text>
      </Pressable>

      {playerIds.map((id) => {
        const pl = players[id];
        if (!pl) return null;
        return (
          <AssetRow
            key={id}
            label={pl.name}
            sub={`${formatPositions(pl)} · ${pl.ovr} · ${money(pl.salary)}`}
            onRemove={() => onRemovePlayer(id)}
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
            sub={prot ? `Proteção top ${prot}` : `Projetada ~#${slot + 1}`}
            subColor={prot ? COLORS.warn : undefined}
            onRemove={() => onRemovePick(pick.id)}
          />
        );
      })}

      {playerIds.length + picks.length === 0 ? (
        <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim, paddingHorizontal: 12, paddingVertical: 12 }}>{emptyHint}</Text>
      ) : null}

      {onAdd ? (
        <Pressable accessibilityRole="button" onPress={onAdd} className="active:opacity-60" style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 1.3, color: COLORS.muted }}>+ ADICIONAR</Text>
        </Pressable>
      ) : null}
      {onSwitchTeam ? (
        <Pressable accessibilityRole="button" onPress={onSwitchTeam} className="active:opacity-60" style={{ height: 28, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.body600, fontSize: 12, color: COLORS.dim }}>{team ? 'trocar parceiro ›' : 'escolher parceiro ›'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

/* -------------------------------------------------------------------------- */

const TradeCenter: React.FC<TradeCenterProps> = ({
  teams, players, userTeamId, gamesPlayed, currentDraft, onTradeExecute, offers, onAcceptOffer, onRejectOffer, initialPartnerId}) => {
  const { accent } = useTheme();
  const userTeam = useMemo(() => teams.find((t) => t.id === userTeamId) || null, [teams, userTeamId]);
  const [partnerTeamId, setPartnerTeamId] = useState<string | null>(initialPartnerId ?? null);
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

  const daysLeft = Math.max(0, TRADE_DEADLINE_GAME - gamesPlayed);
  const verdict = !hasPackage || !partnerEval
    ? null
    : !partnerEval.accepted
      ? { label: 'Recusa', color: COLORS.bad }
      : markerPos > 0.72
        ? { label: 'Generoso', color: COLORS.warn }
        : { label: 'Justo', color: COLORS.good };

  return (
    <Screen
      heroHeight={110}
      footer={
        <Dock>
          <CtaButton
            label="Propor troca"
            sub={hasPackage ? `${outgoingCount} saem · ${incomingCount} entram` : undefined}
            onPress={executeTrade}
            disabled={!canPropose}
          />
        </Dock>
      }
    >
      <ScreenTitle
        title="Trocas"
        right={offers.length > 0 ? <Tag color={COLORS.east}>{offers.length} {offers.length === 1 ? 'oferta' : 'ofertas'}</Tag> : undefined}
      />
      <BodyText size={14} style={{ paddingHorizontal: 20, marginTop: -10 }}>
        {daysLeft > 0 ? `Prazo final em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}` : 'Prazo de trocas encerrado'}
      </BodyText>

      <Body top={14} gap={14}>
        <View className="flex-row" style={{ gap: 8 }}>
          <PackagePanel
            title="VOCÊ CEDE"
            team={userTeam}
            playerIds={userAssets}
            pickIds={userPickIds}
            players={players}
            teams={teams}
            protections={protections}
            onRemovePlayer={(id) => toggleAsset(id, 'user')}
            onRemovePick={(id) => togglePick(id, 'user')}
            onAdd={() => setAssetSheet('user')}
            emptyHint="Jogadores ou picks para enviar."
          />
          <PackagePanel
            title="VOCÊ RECEBE"
            team={partnerTeam}
            playerIds={partnerAssets}
            pickIds={partnerPickIds}
            players={players}
            teams={teams}
            protections={{}}
            onRemovePlayer={(id) => toggleAsset(id, 'partner')}
            onRemovePick={(id) => togglePick(id, 'partner')}
            onAdd={partnerTeam ? () => setAssetSheet('partner') : undefined}
            onSwitchTeam={() => setPickerOpen(true)}
            emptyHint={partnerTeam ? 'O que pedir em troca.' : 'Escolha um parceiro de troca.'}
          />
        </View>

        {/* The balance: four flat segments and a white marker. */}
        <Panel style={{ gap: 10 }}>
          <View className="flex-row justify-between items-baseline">
            <MonoLabel size={9}>Balança de valor</MonoLabel>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: verdict?.color ?? COLORS.dim, textTransform: 'uppercase' }}>
              {verdict ? verdict.label : 'Monte o pacote'}
            </Text>
          </View>
          <View style={{ height: 10, flexDirection: 'row', gap: 2, opacity: hasPackage ? 1 : 0.4 }}>
            <View style={{ flex: 1, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, backgroundColor: '#5A2629' }} />
            <View style={{ flex: 1, backgroundColor: '#4A3A20' }} />
            <View style={{ flex: 1, backgroundColor: '#23402F' }} />
            <View style={{ flex: 1, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: '#1F4A36' }} />
            {hasPackage ? (
              <View style={{ position: 'absolute', left: `${markerPos * 100}%`, top: -5, width: 4, height: 20, marginLeft: -2, borderRadius: 2, backgroundColor: COLORS.text }} />
            ) : null}
          </View>
          <View className="flex-row justify-between">
            {['Recusa', 'Justo', 'Generoso'].map((l) => (
              <Text key={l} style={{ fontFamily: FONT.cond600, fontSize: 11, letterSpacing: 1.1, color: COLORS.faint, textTransform: 'uppercase' }}>{l}</Text>
            ))}
          </View>
          {/* Salary match / roster minimum / value, live as you build. */}
          {/* Why a trade is blocked is a sentence, not a label: on a phone a
              one-line tag cut it to "...acima do teto salarial e não pode". */}
          {legality && !legality.legal ? (
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: withAlpha(COLORS.bad, 0.55), paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ fontFamily: FONT.body600, fontSize: 12.5, lineHeight: 17, color: COLORS.bad }}>{legality.reason}</Text>
            </View>
          ) : null}
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {legality?.legal ? <Tag color={COLORS.good}>Salários batem</Tag> : null}
            {hasPackage && userValueEval ? (
              <Tag color={valuePct > 5 ? COLORS.good : valuePct < -5 ? COLORS.warn : COLORS.textSoft}>
                {valuePct > 5 ? `Você ganha ${valuePct}%` : valuePct < -5 ? `Você perde ${Math.abs(valuePct)}%` : 'Valor equilibrado'}
              </Tag>
            ) : null}
            {userTeam && outgoingCount > 0 ? (
              <Tag color={COLORS.textSoft}>Elenco fica com {userTeam.roster.length - userAssets.length + partnerAssets.length}</Tag>
            ) : null}
          </View>
        </Panel>

        {/* Protections, only once there's an outgoing pick to protect. */}
        {userTeam && userPickIds.length > 0 ? (
          <Panel style={{ gap: 8 }}>
            <MonoLabel size={9}>Proteção das suas picks</MonoLabel>
            {picksOf(userTeam).filter((pk) => userPickIds.includes(pk.id)).map((pick) => (
              <View key={pick.id} className="flex-row items-center justify-between" style={{ minHeight: 40 }}>
                <Name size={15}>1ª rodada {pick.originalTeamId.toUpperCase()} · draft {pick.draft}</Name>
                <Chip tone={protections[pick.id] ? 'warn' : 'neutral'} onPress={() => toggleProtection(pick.id)}>
                  {protections[pick.id] ? `Top ${protections[pick.id]}` : 'Proteger'}
                </Chip>
              </View>
            ))}
          </Panel>
        ) : null}

        {/* GM reaction */}
        {tradeStatus !== 'idle' ? (
          <Panel bar={tradeStatus === 'accepted' ? COLORS.good : COLORS.bad} style={{ gap: 6 }}>
            <MonoLabel size={9}>Resposta do GM</MonoLabel>
            <HeroTitle size={26} color={tradeStatus === 'accepted' ? COLORS.good : COLORS.bad}>
              {tradeStatus === 'accepted' ? 'Aceito' : 'Recusado'}
            </HeroTitle>
            <BodyText color={COLORS.textSoft}>“{gmReaction}”</BodyText>
          </Panel>
        ) : null}

        {/* Inbox */}
        <OffersInbox
          offers={offers}
          teams={teams}
          players={players}
          currentDraft={currentDraft}
          gamesPlayed={gamesPlayed}
          onAccept={onAcceptOffer}
          onReject={onRejectOffer}
          onSelectPlayer={setInspecting}
        />
      </Body>

      {/* Partner picker */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Escolha o parceiro">
        {teams.filter((t) => t.id !== userTeamId).sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
          <Pressable accessibilityRole="button"
            key={t.id}
            onPress={() => { setPartnerTeamId(t.id); setPartnerAssets([]); setPartnerPickIds([]); setPickerOpen(false); }}
            className="flex-row items-center gap-3 p-3 rounded-xl active:opacity-70"
          >
            <TeamBadge teamId={t.id} width={34} height={22} />
            <TeamLogo teamId={t.id} size={26} chip />
            <Name size={16}>{t.name}</Name>
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

const Sheet: React.FC<{ visible: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }> = ({
  visible, onClose, title, children, footer,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    {/* Backdrop as a SIBLING of the sheet: nested Pressables took the drag on
        Android and the list inside could not scroll (same fix as the player
        sheet). */}
    <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(5,5,6,0.72)' }}>
      <Pressable accessible={false} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
      <View style={{ maxHeight: '78%', backgroundColor: COLORS.navBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 14 }}>
        <View className="self-center mb-3" style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.lineStrong }} />
        <SectionLabel>{title}</SectionLabel>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1, marginTop: 10 }}>{children}</ScrollView>
        {footer ? <View style={{ paddingTop: 10 }}>{footer}</View> : null}
      </View>
    </View>
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
    <Sheet
      visible
      onClose={onClose}
      title={side === 'user' ? 'O que você envia' : `O que pedir ao ${getTeamNickname(team)}`}
      // A multi-select sheet needs a way out that isn't "tap the dimmed bit".
      footer={<CtaButton label="Pronto" sub={`${selectedPlayers.length + selectedPicks.length} selecionado${selectedPlayers.length + selectedPicks.length === 1 ? '' : 's'}`} onPress={onClose} />}
    >
      <FilterRow items={POSITION_FILTERS} value={pos} onChange={setPos} style={{ marginBottom: 12 }} />

      <View style={{ gap: 8 }}>
        {roster.map((p) => {
          const on = selectedPlayers.includes(p.id);
          return (
            <Pressable accessibilityRole="button"
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
                <Pressable accessibilityRole="button"
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
  gamesPlayed: number;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSelectPlayer: (p: Player) => void;
}> = ({ offers, teams, players, currentDraft, gamesPlayed, onAccept, onReject, onSelectPlayer }) => {
  if (offers.length === 0) return null;
  const named = (ids: string[]) => ids.map((id) => players[id]).filter(Boolean);

  return (
    <View>
      <SectionLabel>Ofertas recebidas · {offers.length}</SectionLabel>
      <View style={{ marginTop: 4 }}>
        {offers.map((offer) => {
          const from = teams.find((t) => t.id === offer.fromTeamId);
          const give = named(offer.requestIds);
          const get = named(offer.offerIds);
          // Picks the CPU throws in count toward the verdict, or a pick-heavy
          // offer would read as "ruim" no matter how good it is.
          const offeredPicks = from ? picksOf(from).filter((pk) => (offer.offerPickIds ?? []).includes(pk.id)) : [];
          const giveVal = give.reduce((sum, pl) => sum + playerValue(pl), 0);
          const getVal = get.reduce((sum, pl) => sum + playerValue(pl), 0) + picksValue(offeredPicks, teams, currentDraft);
          const ratio = giveVal > 0 ? getVal / giveVal : 1;
          const verdict = ratio >= 1.05
            ? { t: 'Boa', c: COLORS.good }
            : ratio >= 0.95
              ? { t: 'Justa', c: COLORS.textSoft }
              : { t: 'Ruim', c: COLORS.bad };
          const left = offer.day !== undefined
            ? Math.max(1, Math.min(OFFER_TTL - (gamesPlayed - offer.day), TRADE_DEADLINE_GAME - gamesPlayed))
            : undefined;

          return (
            <View key={offer.id} style={{ paddingVertical: 10, gap: 9, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                {from ? <TeamBadge teamId={from.id} width={34} height={22} /> : null}
                <View className="flex-1" style={{ minWidth: 0, gap: 2 }}>
                  <Name size={14}>Querem {give.map((pl) => pl.name).join(', ')}</Name>
                  <Text numberOfLines={2} style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>
                    Oferecem {[...get.map((pl) => `${pl.name} (${pl.ovr})`), ...(offeredPicks.length ? [`${offeredPicks.length} ${offeredPicks.length === 1 ? 'pick' : 'picks'} de 1ª`] : [])].join(' + ')}
                  </Text>
                  {left !== undefined ? (
                    <Text style={{ fontFamily: FONT.body500, fontSize: 11.5, color: left <= 2 ? COLORS.warn : COLORS.faint }}>
                      {left === 1 ? 'Expira no próximo jogo' : `Expira em ${left} jogos`}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1, color: verdict.c, textTransform: 'uppercase' }}>{verdict.t}</Text>
              </View>
              <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                {[...give, ...get].map((pl) => (
                  <Chip key={pl.id} onPress={() => onSelectPlayer(pl)}>{pl.name} · {pl.ovr}</Chip>
                ))}
              </View>
              <View className="flex-row" style={{ gap: 8 }}>
                <GhostButton label="Recusar" onPress={() => onReject(offer.id)} style={{ flex: 1 }} />
                <GhostButton filled label="Aceitar" color={COLORS.good} onPress={() => onAccept(offer.id)} style={{ flex: 1 }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
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
        <Pressable accessibilityRole="button"
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
