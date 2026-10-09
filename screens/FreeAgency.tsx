import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { SeasonState, Player } from '../types';
import {
  getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamSalary, SALARY_CAP, LUXURY_TAX, getPlayerPositions,
  formatPositions, getTeamNickname, attributeColor, LINEUP_POSITIONS,
} from '../constants';
import { getFreeAgents, signFreeAgentLegality, newContractYears, evaluateSigningInterest, signingRoute } from '../services/freeAgencyService';
import { MIN_ROSTER_SIZE, MAX_ROSTER_SIZE } from '../services/tradeService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS, FONT, ovrColor } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, Stat, Meter, Chip, CtaButton, GhostButton, FilterRow, ScreenTitle, BodyText, Name, Dock } from '../components/ui/kit';
import { useDesktop } from '../components/desktop/useDesktop';
import { DPage, DDock, DCta, DTitle } from '../components/desktop/kit';

// Design 3b. Two things are always on screen: how much room you actually have,
// and whether the player would even come. The old version let you tap "Assinar"
// on a star who'd never sign for a rebuild and only then explained why — here
// the standing is on the card, before the tap.

interface FreeAgencyProps {
  season: SeasonState;
  onSign: (playerId: string) => void;
  onStartSeason: () => void;
}

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
const POSITION_FILTERS = [
  { id: 'TODOS', label: 'Todos' }, { id: 'PG', label: 'PG' }, { id: 'SG', label: 'SG' },
  { id: 'SF', label: 'SF' }, { id: 'PF', label: 'PF' }, { id: 'C', label: 'C' },
];

// Sort keys the GM actually shops on. "Anos" is the length of the deal the
// player would sign (newContractYears) — a free agent's own contractYears is 0
// by definition, since expiring is what put them in the pool.
type SortKey = 'ovr' | 'salary' | 'years';
const SORTS: { key: SortKey; label: string; value: (p: Player) => number }[] = [
  { key: 'ovr', label: 'OVR', value: (p) => p.ovr },
  { key: 'salary', label: 'Salário', value: (p) => p.salary },
  { key: 'years', label: 'Anos', value: (p) => newContractYears(p) },
];

// The three standings a free agent can be in relative to YOUR team. Derived,
// never numeric — the sim's interest model is a yes/no, so showing a fake
// percentage would be inventing precision that doesn't exist.
type Standing = { label: string; color: string; fill: number };
const STANDING = {
  wants: { label: 'Quer vir', color: COLORS.good, fill: 0.9 },
  open: { label: 'Disponível', color: COLORS.textSoft, fill: 0.55 },
  refuses: { label: 'Sem interesse', color: COLORS.dim, fill: 0.18 },
  noRoom: { label: 'Não cabe', color: COLORS.warn, fill: 0.12 },
} satisfies Record<string, Standing>;

const FreeAgency: React.FC<FreeAgencyProps> = ({ season, onSign, onStartSeason }) => {
  const { accent } = useTheme();
  const desktop = useDesktop();
  const [posFilter, setPosFilter] = useState('TODOS');
  const [sortKey, setSortKey] = useState<SortKey>('ovr');
  const [sortAsc, setSortAsc] = useState(false);
  const { teams, players, userTeamId } = season;
  const userTeam = teams.find((t) => t.id === userTeamId);

  const freeAgents = useMemo(() => getFreeAgents(teams, players), [teams, players]);

  // Lineup slots with nobody to fill them — surfaced so the GM knows what to shop for.
  const holes = useMemo(() => {
    if (!userTeam) return [];
    const covered = new Set<string>();
    userTeam.roster.forEach((id) => {
      const p = players[id];
      if (p) getPlayerPositions(p).forEach((pos) => covered.add(pos));
    });
    return LINEUP_POSITIONS.filter((pos) => !covered.has(pos));
  }, [userTeam, players]);

  if (!userTeam) return null;

  const salary = getTeamSalary(userTeam, players);
  const capSpace = SALARY_CAP - salary;
  const rosterCount = userTeam.roster.length;
  const belowMin = rosterCount < MIN_ROSTER_SIZE;
  // The draft can push a roster past the limit; the season will not open until
  // the user cuts back (dispensar, in Meu Time).
  const aboveMax = rosterCount > MAX_ROSTER_SIZE;

  const byPos = posFilter === 'TODOS' ? freeAgents : freeAgents.filter((p) => getPlayerPositions(p).includes(posFilter));
  const sortValue = SORTS.find((s) => s.key === sortKey)!.value;
  // Your own free agents lead the list whatever the sort: they are the ones
  // only you can sign right now (first refusal), and the ones you lose if you
  // start the season without deciding.
  const isOwn = (p: Player) => p.birdTeamId === userTeamId;
  const filtered = [...byPos].sort((a, b) =>
    Number(isOwn(b)) - Number(isOwn(a))
    || (sortAsc ? sortValue(a) - sortValue(b) : sortValue(b) - sortValue(a)));
  const ownCount = freeAgents.filter(isOwn).length;

  // Clicking the active key flips direction; a new key starts descending
  // (best/most first, the common case).
  const onSortPress = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const tiles = (
    <View className="flex-row" style={{ gap: 8 }}>
      <Panel padding={13} className="flex-1" style={{ gap: 3 }}>
        <MonoLabel size={9}>Espaço no teto</MonoLabel>
        <Stat size={24} color={capSpace >= 0 ? COLORS.good : COLORS.warn} fit>
          {capSpace >= 0 ? money(capSpace) : `–${money(Math.abs(capSpace))}`}
        </Stat>
        <BodyText size={12} color={COLORS.dim}>
          {capSpace >= 0 ? 'Livre para assinar' : salary > LUXURY_TAX ? 'Acima do imposto' : 'Só mínimo e exceção'}
        </BodyText>
      </Panel>
      <Panel padding={13} className="flex-1" style={{ gap: 3 }}>
        <MonoLabel size={9}>Buracos</MonoLabel>
        <Stat size={24} fit>{holes.length > 0 ? holes.join(' · ') : 'Nenhum'}</Stat>
        <BodyText size={12} color={belowMin || aboveMax ? COLORS.warn : COLORS.dim}>
          {rosterCount} no elenco · mín {MIN_ROSTER_SIZE}
        </BodyText>
      </Panel>
    </View>
  );

  const sortRow = (
    <View className="flex-row items-center" style={{ gap: 6 }}>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.4, color: COLORS.dim, width: 58 }}>ORDENAR</Text>
      {SORTS.map((so) => {
        const active = sortKey === so.key;
        return (
          <Pressable accessibilityRole="button"
            key={so.key}
            onPress={() => onSortPress(so.key)}
            className="flex-row items-center active:opacity-75"
            style={{ gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 9, backgroundColor: active ? COLORS.lineStrong : COLORS.surface2 }}
          >
            <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 0.8, color: active ? COLORS.text : COLORS.muted, textTransform: 'uppercase' }}>{so.label}</Text>
            {active ? <Text style={{ fontSize: 8, color: COLORS.muted }}>{sortAsc ? '▲' : '▼'}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );

  const renderCard = (player: Player) => {
    const legality = signFreeAgentLegality(userTeam, player, players);
    const interest = evaluateSigningInterest(player, userTeam, teams, players);
    const fillsHole = holes.some((h) => getPlayerPositions(player).includes(h));
    const own = isOwn(player);
    const route = legality.legal ? signingRoute(userTeam, player, players) : null;

    const standing: Standing = !legality.legal
      ? STANDING.noRoom
      : !interest.willing
        ? STANDING.refuses
        : fillsHole
          ? STANDING.wants
          : STANDING.open;
    const canSign = legality.legal && interest.willing;
    // The blocking reason, whichever gate is actually closed.
    const reason = !legality.legal ? legality.reason : !interest.willing ? interest.reason : undefined;

    return (
      <Panel key={player.id} bar={standing.color} padding={12} radius={14} style={{ gap: 8 }}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <Text style={{ width: 30, fontFamily: FONT.cond800, fontSize: 24, lineHeight: 24, color: ovrColor(player.ovr) }}>{player.ovr}</Text>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Name size={16}>{player.name}</Name>
            <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>
              {formatPositions(player)} · {player.age}a · pede {money(player.salary)}/{newContractYears(player)}a
              {own ? ' · seu jogador' : ''}{fillsHole ? ' · lacuna' : ''}
            </Text>
          </View>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 11.5, letterSpacing: 0.9, color: standing.color, textTransform: 'uppercase' }}>{standing.label}</Text>
        </View>
        {reason ? <BodyText size={12} color={COLORS.dim}>{reason}</BodyText> : null}
        {/* How the signing fits, when it is not plain cap room. */}
        {canSign && route === 'mid_level' ? (
          <BodyText size={12} color={COLORS.dim}>Usa a exceção de nível médio — só uma por verão.</BodyText>
        ) : null}
        {canSign && route === 'bird' && capSpace < player.salary ? (
          <BodyText size={12} color={COLORS.dim}>Direito de renovação: pode passar do teto.</BodyText>
        ) : null}
        {canSign ? (
          <GhostButton filled label={`Assinar por ${money(player.salary)}`} onPress={() => onSign(player.id)} color={COLORS.good} />
        ) : null}
      </Panel>
    );
  };

  // PC: cap room and holes beside the title, the market as a grid of two.
  if (desktop) {
    return (
      <DPage
        footer={
          <DDock
            note={belowMin
              ? `O elenco precisa de no mínimo ${MIN_ROSTER_SIZE} jogadores.`
              : aboveMax
                ? `Máximo de ${MAX_ROSTER_SIZE}: dispense ${rosterCount - MAX_ROSTER_SIZE} em Meu Time.`
                : `Contratos expiraram pela liga inteira. Reforce o ${getTeamNickname(userTeam)} antes de começar.`}
          >
            <DCta
              label="Começar temporada"
              sub={belowMin ? `Faltam ${MIN_ROSTER_SIZE - rosterCount}` : aboveMax ? `Dispense ${rosterCount - MAX_ROSTER_SIZE}` : `${rosterCount} no elenco`}
              onPress={onStartSeason}
              disabled={belowMin || aboveMax}
            />
          </DDock>
        }
      >
        <DTitle title="Agência livre" right={<View style={{ width: 560 }}>{tiles}</View>} />
        <BodyText size={15} style={{ marginTop: 6 }}>Offseason · {freeAgents.length} jogadores no mercado</BodyText>
        {ownCount > 0 ? (
          <BodyText size={13} style={{ marginTop: 10, maxWidth: 820 }}>
            {ownCount === 1 ? '1 jogador seu quer' : `${ownCount} jogadores seus querem`} renovar. Você tem a preferência e pode
            passar do teto para mantê-los — quem você não assinar vai ao mercado quando a temporada começar.
          </BodyText>
        ) : null}
        <View className="flex-row items-center justify-between" style={{ marginTop: 18, gap: 20 }}>
          <FilterRow items={POSITION_FILTERS} value={posFilter} onChange={setPosFilter} />
          {sortRow}
        </View>
        <View className="flex-row flex-wrap" style={{ gap: 12, marginTop: 16 }}>
          {filtered.map((player) => (
            <View key={player.id} style={{ width: '49%', flexGrow: 1 }}>{renderCard(player)}</View>
          ))}
        </View>
        {filtered.length === 0 ? <BodyText color={COLORS.dim} style={{ marginTop: 12 }}>Nenhum agente livre nessa posição.</BodyText> : null}
      </DPage>
    );
  }

  return (
    <Screen
      heroHeight={110}
      footer={
        <Dock>
          <CtaButton
            label="Começar temporada"
            sub={belowMin ? `Faltam ${MIN_ROSTER_SIZE - rosterCount}` : aboveMax ? `Dispense ${rosterCount - MAX_ROSTER_SIZE}` : `${rosterCount} no elenco`}
            onPress={onStartSeason}
            disabled={belowMin || aboveMax}
          />
          {belowMin || aboveMax ? (
            <BodyText size={12} color={COLORS.warn} style={{ textAlign: 'center' }}>
              {belowMin
                ? `O elenco precisa de no mínimo ${MIN_ROSTER_SIZE} jogadores.`
                : `Máximo de ${MAX_ROSTER_SIZE}: dispense ${rosterCount - MAX_ROSTER_SIZE} em Meu Time.`}
            </BodyText>
          ) : null}
        </Dock>
      }
    >
      <ScreenTitle title="Agência livre" />
      <BodyText size={14} style={{ paddingHorizontal: 20, marginTop: -10 }}>
        Offseason · {freeAgents.length} jogadores no mercado
      </BodyText>

      <Body top={14} gap={12}>
        {tiles}

        {ownCount > 0 ? (
          <BodyText size={12.5}>
            {ownCount === 1 ? '1 jogador seu quer' : `${ownCount} jogadores seus querem`} renovar. Você tem a preferência e pode
            passar do teto para mantê-los — quem você não assinar vai ao mercado quando a temporada começar.
          </BodyText>
        ) : null}

        <FilterRow items={POSITION_FILTERS} value={posFilter} onChange={setPosFilter} />

        {sortRow}

        {filtered.map(renderCard)}

        {filtered.length === 0 ? (
          <BodyText color={COLORS.dim}>Nenhum agente livre nessa posição.</BodyText>
        ) : null}

        <BodyText size={12} color={COLORS.dim}>
          Contratos expiraram pela liga inteira. Quem ninguém pôde pagar baixou o pedido. Reforce o {getTeamNickname(userTeam)} antes de começar a nova temporada.
        </BodyText>
      </Body>
    </Screen>
  );
};

export default FreeAgency;
