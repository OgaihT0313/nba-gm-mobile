import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { SeasonState, Player } from '../types';
import {
  getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamSalary, SALARY_CAP, getPlayerPositions,
  formatPositions, getTeamNickname, attributeColor, LINEUP_POSITIONS,
} from '../constants';
import { getFreeAgents, signFreeAgentLegality, newContractYears, evaluateSigningInterest } from '../services/freeAgencyService';
import { MIN_ROSTER_SIZE } from '../services/tradeService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, Stat, Meter, Chip, CtaButton, GhostButton, FilterRow } from '../components/ui/kit';

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
  open: { label: 'Disponível', color: COLORS.warn, fill: 0.55 },
  refuses: { label: 'Sem interesse', color: COLORS.cta, fill: 0.18 },
  noRoom: { label: 'Não cabe', color: COLORS.cta, fill: 0.12 },
} satisfies Record<string, Standing>;

const FreeAgency: React.FC<FreeAgencyProps> = ({ season, onSign, onStartSeason }) => {
  const { accent } = useTheme();
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

  const byPos = posFilter === 'TODOS' ? freeAgents : freeAgents.filter((p) => getPlayerPositions(p).includes(posFilter));
  const sortValue = SORTS.find((s) => s.key === sortKey)!.value;
  const filtered = [...byPos].sort((a, b) => (sortAsc ? sortValue(a) - sortValue(b) : sortValue(b) - sortValue(a)));

  // Clicking the active key flips direction; a new key starts descending
  // (best/most first, the common case).
  const onSortPress = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <Screen
      heroHeight={172}
      footer={
        <CtaButton
          label="Começar temporada"
          sub={belowMin ? `Faltam ${MIN_ROSTER_SIZE - rosterCount} para o mínimo de ${MIN_ROSTER_SIZE}` : `${rosterCount} no elenco · pronto`}
          onPress={onStartSeason}
          disabled={belowMin}
        />
      }
    >
      <HeroContent>
        <Eyebrow>Agência livre</Eyebrow>
        <View className="flex-row items-end justify-between" style={{ marginTop: 12 }}>
          <View>
            <Stat size={34} style={{ lineHeight: 31 }} color={capSpace >= 0 ? '#fff' : COLORS.badSoft}>
              {capSpace >= 0 ? money(capSpace) : `-${money(Math.abs(capSpace))}`}
            </Stat>
            <MonoLabel size={10} color="rgba(255,255,255,0.65)" style={{ marginTop: 5, letterSpacing: 0.5 }}>
              Espaço no teto
            </MonoLabel>
          </View>
          <View className="items-end" style={{ paddingBottom: 3 }}>
            <Stat size={15} color={belowMin ? COLORS.badSoft : '#fff'}>{rosterCount}</Stat>
            <MonoLabel size={9.5} color="rgba(255,255,255,0.55)" style={{ marginTop: 3, letterSpacing: 0.4 }}>
              No elenco · mín {MIN_ROSTER_SIZE}
            </MonoLabel>
          </View>
        </View>
        <Meter
          value={Math.min(1, salary / SALARY_CAP)}
          height={6}
          track="rgba(0,0,0,0.35)"
          colors={salary > SALARY_CAP ? [COLORS.warn, COLORS.cta] : [accent.primary, accent.secondary]}
          style={{ marginTop: 12 }}
        />
      </HeroContent>

      <Body top={16}>
        {/* What the roster is actually missing. */}
        <Panel padding={13}>
          <MonoLabel style={{ marginBottom: 9 }}>Buracos no elenco</MonoLabel>
          <View className="flex-row flex-wrap" style={{ gap: 7 }}>
            {holes.length > 0 ? (
              holes.map((h) => <Chip key={h} tone="bad" size={10}>Sem {h} natural</Chip>)
            ) : (
              <Chip tone="good" size={10}>Todas as posições cobertas</Chip>
            )}
            {belowMin ? <Chip tone="bad" size={10}>Elenco abaixo do mínimo</Chip> : null}
            {capSpace < 0 ? <Chip tone="warn" size={10}>Acima do teto</Chip> : null}
          </View>
          <MonoLabel size={9.5} color={INK.faint} style={{ marginTop: 10, letterSpacing: 0 }}>
            {freeAgents.length} agentes livres no mercado
          </MonoLabel>
        </Panel>

        <FilterRow items={POSITION_FILTERS} value={posFilter} onChange={setPosFilter} />

        <View className="flex-row items-center" style={{ gap: 6 }}>
          <MonoLabel size={9} color={INK.faint}>Ordenar</MonoLabel>
          {SORTS.map((s) => {
            const active = sortKey === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => onSortPress(s.key)}
                className="flex-row items-center active:opacity-70"
                style={{
                  gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
                  backgroundColor: active ? COLORS.line : COLORS.panel,
                  borderWidth: 1, borderColor: active ? COLORS.textDim : COLORS.line,
                }}
              >
                <MonoLabel size={9} color={active ? '#fff' : INK.meta} style={{ letterSpacing: 0.4 }}>{s.label}</MonoLabel>
                {active ? <Text style={{ fontSize: 8, color: COLORS.textDim }}>{sortAsc ? '▲' : '▼'}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        {filtered.map((player) => {
          const legality = signFreeAgentLegality(userTeam, player, players);
          const interest = evaluateSigningInterest(player, userTeam, teams, players);
          const fillsHole = holes.some((h) => getPlayerPositions(player).includes(h));

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
            <Panel key={player.id} bar={standing.color} padding={13}>
              <View className="flex-row items-center" style={{ gap: 11 }}>
                <Image
                  source={{ uri: getPlayerImageUrl(player) }}
                  placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                  style={{ width: 40, height: 40, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <Text className="font-extrabold text-white" style={{ fontSize: 13.5, flexShrink: 1 }} numberOfLines={1}>
                      {player.name}
                    </Text>
                    {fillsHole ? (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: COLORS.line }}>
                        <MonoLabel size={8.5} color={COLORS.warn} style={{ letterSpacing: 0.4 }}>Lacuna</MonoLabel>
                      </View>
                    ) : null}
                  </View>
                  <MonoLabel size={10} color={INK.meta} style={{ marginTop: 3, letterSpacing: 0 }} numberOfLines={1}>
                    {player.age}a · {formatPositions(player)} · pede {money(player.salary)}/{newContractYears(player)}a
                  </MonoLabel>
                </View>
                <Stat size={21} color={attributeColor(player.ovr)}>{player.ovr}</Stat>
              </View>

              <View className="flex-row items-center" style={{ gap: 8, marginTop: 11 }}>
                <MonoLabel size={8.5} color={INK.faint}>Interesse</MonoLabel>
                <Meter value={standing.fill} color={standing.color} height={5} track={COLORS.sunken} style={{ flex: 1 }} />
                <MonoLabel size={10} color={standing.color} style={{ letterSpacing: 0.4 }}>{standing.label}</MonoLabel>
              </View>

              {reason ? (
                <Text style={{ fontSize: 10.5, lineHeight: 15, color: INK.faint, marginTop: 7 }}>{reason}</Text>
              ) : null}

              {canSign ? (
                <GhostButton
                  label={`Assinar por ${money(player.salary)}`}
                  onPress={() => onSign(player.id)}
                  color={COLORS.goodSoft}
                  padding={10}
                  size={10.5}
                  style={{ marginTop: 10 }}
                />
              ) : null}
            </Panel>
          );
        })}

        {filtered.length === 0 ? (
          <Text style={{ fontSize: 12, color: INK.faint, fontStyle: 'italic', paddingHorizontal: 4 }}>
            Nenhum agente livre nessa posição.
          </Text>
        ) : null}

        <Text style={{ fontSize: 10.5, lineHeight: 15, color: INK.faint, paddingHorizontal: 4 }}>
          Contratos expiraram pela liga inteira. Reforce o {getTeamNickname(userTeam)} antes de começar a nova temporada.
        </Text>
      </Body>
    </Screen>
  );
};

export default FreeAgency;
