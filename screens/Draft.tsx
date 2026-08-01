import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { SeasonState, Player, ScoutReport } from '../types';
import {
  getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, getTeamLogoUrl, getTeamNickname,
  getTeamTricode, formatPositions,
} from '../constants';
import { consensusValue, draftVerdict, SCOUT_BUDGET, PROJECTION_FLOOR, PROJECTION_CEIL } from '../services/draftService';
import { careerAverages, honorsSummary } from '../services/careerService';
import { useTheme } from '../src/theme/ThemeProvider';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import {
  Panel, Well, MonoLabel, Eyebrow, HeroTitle, Stat, Meter, CtaButton, GhostButton, FilterRow, SectionLabel,
} from '../components/ui/kit';

// Design 3a. The system decision this screen encodes: the fog of war is
// VISUAL. A prospect is never a number — he's a band on a 60-99 rail, and every
// scouting report you spend narrows it. A nebulous 64-85 and a settled 78 look
// nothing alike, which is the whole read before you burn a lottery pick.

interface DraftProps {
  season: SeasonState;
  onPick: (playerId: string) => void;
  onAutoPick: () => void;
  onFinish: () => void;
  onScout: (playerId: string) => void;
}

const POSITION_FILTERS = [
  { id: 'TODOS', label: 'Todos' }, { id: 'PG', label: 'PG' }, { id: 'SG', label: 'SG' },
  { id: 'SF', label: 'SF' }, { id: 'PF', label: 'PF' }, { id: 'C', label: 'C' },
];
const NBA_FALLBACK = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// The rail the projection band is drawn on, taken from draftService's own
// clamps so the axis can never contradict the number printed above it.
const RAIL_MIN = PROJECTION_FLOOR;
const RAIL_MAX = PROJECTION_CEIL;

// How wide the band is, in words — a nebulous 65-83 is a gamble, a settled 74
// is a floor.
const CONFIDENCE = (u: number) =>
  u === 0 ? { label: 'Definido', color: COLORS.good }
    : u <= 3 ? { label: 'Confiável', color: COLORS.goodSoft }
      : u <= 6 ? { label: 'Incerto', color: COLORS.warn }
        : { label: 'Nebuloso', color: COLORS.bad };

const bandText = (r: ScoutReport) =>
  r.uncertainty === 0 ? `${r.estimate}` : `${r.estimate - r.uncertainty}–${r.estimate + r.uncertainty}`;

const pct = (v: number) => Math.max(0, Math.min(1, (v - RAIL_MIN) / (RAIL_MAX - RAIL_MIN)));

/** The 60→99 rail with the prospect's projected range lit on it. */
const ProjectionBand: React.FC<{ report: ScoutReport }> = ({ report }) => {
  const lo = pct(report.estimate - report.uncertainty);
  const hi = pct(report.estimate + report.uncertainty);
  const conf = CONFIDENCE(report.uncertainty);

  return (
    <View>
      <View style={{ height: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.sunken, overflow: 'hidden' }}>
        <View
          style={{
            position: 'absolute',
            left: `${lo * 100}%`,
            // A fully-settled report has zero width, so it gets a minimum so it
            // still reads as a mark rather than disappearing.
            width: `${Math.max(2.5, (hi - lo) * 100)}%`,
            top: 0,
            bottom: 0,
            borderRadius: RADIUS.pill,
            backgroundColor: conf.color,
          }}
        />
      </View>
      <View className="flex-row justify-between" style={{ marginTop: 5 }}>
        <MonoLabel size={9} color={INK.faint} style={{ letterSpacing: 0 }}>{RAIL_MIN}</MonoLabel>
        <MonoLabel size={9} color={conf.color} style={{ letterSpacing: 0.4 }}>{conf.label}</MonoLabel>
        <MonoLabel size={9} color={INK.faint} style={{ letterSpacing: 0 }}>{RAIL_MAX}</MonoLabel>
      </View>
    </View>
  );
};

const Draft: React.FC<DraftProps> = ({ season, onPick, onAutoPick, onFinish, onScout }) => {
  const { accent } = useTheme();
  const [posFilter, setPosFilter] = useState('TODOS');
  const [showRetirees, setShowRetirees] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
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
    [draft, players],
  );

  // Biggest names first — a career-defining retirement should lead, not the
  // fringe guys who washed out.
  const retirees = useMemo(
    () =>
      (season.lastRetirements || [])
        .map((id) => players[id])
        .filter(Boolean)
        .sort((a, b) => (b.career?.peakOvr ?? b.ovr) - (a.career?.peakOvr ?? a.ovr)),
    [season.lastRetirements, players],
  );

  if (!draft || !userTeam) return null;

  const onClockSlot = draft.complete ? null : draft.order[draft.picks.length];
  const userOnClock = onClockSlot?.teamId === userTeamId;
  const overallPick = draft.picks.length + 1;
  const onClockTeam = teams.find((t) => t.id === onClockSlot?.teamId);

  const filtered = posFilter === 'TODOS'
    ? available
    : available.filter((p) => (p.positions || [p.pos]).includes(posFilter));

  // The card at the top of the board. Tapping any row promotes it here, which
  // is what makes the pinned CTA ("DRAFTAR FULANO") an actual decision.
  const focus = filtered.find((p) => p.id === focusId) ?? filtered[0];
  const rest = filtered.filter((p) => p.id !== focus?.id);

  // A five-slot window of the pick order around whoever is on the clock.
  const queue = draft.order
    .map((slot, i) => ({ slot, number: i + 1 }))
    .slice(Math.max(0, draft.picks.length - 3), draft.picks.length + 2);

  return (
    <Screen
      heroHeight={160}
      footer={
        draft.complete ? (
          <CtaButton label="Ir para a agência livre" onPress={onFinish} />
        ) : userOnClock && focus ? (
          <View className="flex-row" style={{ gap: 8 }}>
            <GhostButton label="Deixar pra staff" onPress={onAutoPick} padding={14} style={{ flex: 1 }} />
            <CtaButton
              label={`Draftar ${focus.name.split(' ').slice(-1)[0]}`}
              onPress={() => onPick(focus.id)}
              size={13}
              style={{ flex: 1.5 }}
            />
          </View>
        ) : undefined
      }
    >
      <HeroContent>
        <View className="flex-row justify-between items-baseline">
          <Eyebrow>Draft de recrutas</Eyebrow>
          <Eyebrow size={9.5}>Classe {season.awardHistory.length || 1}</Eyebrow>
        </View>

        <View className="flex-row items-end" style={{ gap: 12, marginTop: 12 }}>
          {/* No pick number once it's over: the board only has 30 slots, so a
              finished draft was rendering "#31" — a pick that cannot exist. */}
          {!draft.complete ? <Stat size={42} style={{ lineHeight: 38 }}>#{overallPick}</Stat> : null}
          <View style={{ paddingBottom: 5, flex: 1 }}>
            <HeroTitle size={draft.complete ? 22 : 15}>
              {draft.complete ? 'Draft encerrado' : userOnClock ? 'Sua vez' : 'Na vez'}
            </HeroTitle>
            <MonoLabel size={10} color="rgba(255,255,255,0.6)" style={{ marginTop: 2, letterSpacing: 0.4 }} numberOfLines={1}>
              {draft.complete ? `${draft.picks.length} recrutas selecionados` : onClockTeam?.name ?? ''}
            </MonoLabel>
          </View>
          {onClockTeam && !draft.complete ? (
            <Image source={{ uri: getTeamLogoUrl(onClockTeam) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 34, height: 34 }} contentFit="contain" />
          ) : null}
        </View>

        {!draft.complete ? (
          <View className="flex-row items-center" style={{ gap: 5, marginTop: 14, flexWrap: 'wrap' }}>
            {queue.map(({ slot, number }) => {
              const onClock = number === overallPick;
              const t = teams.find((x) => x.id === slot.teamId);
              const mine = slot.teamId === userTeamId;
              return (
                <View
                  key={number}
                  style={{
                    paddingHorizontal: onClock ? 9 : 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: onClock ? '#fff' : 'rgba(0,0,0,0.35)',
                    borderWidth: mine && !onClock ? 1 : 0,
                    borderColor: accent.primary,
                  }}
                >
                  <MonoLabel
                    size={9}
                    color={onClock ? COLORS.bg : number < overallPick ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)'}
                    style={{ letterSpacing: 0 }}
                  >
                    {number} {getTeamTricode(t)}
                  </MonoLabel>
                </View>
              );
            })}
          </View>
        ) : null}
      </HeroContent>

      <Body top={16}>
        {/* Everything between here and the results board is about PICKING, so
            none of it survives the draft ending: with zero prospects left the
            filter chips just sat there over "Nenhum recruta nessa posição". */}
        {!draft.complete ? (
          <>
            {/* Board head — availability on the left, the scouting budget (the
                real constraint on this screen) on the right. */}
            <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 3 }}>
              <MonoLabel>Disponíveis · {available.length}</MonoLabel>
              <MonoLabel size={9} color={draft.scoutBudget > 0 ? COLORS.warn : COLORS.bad} style={{ letterSpacing: 0.5 }}>
                Olheiros: {draft.scoutBudget} de {SCOUT_BUDGET}
              </MonoLabel>
            </View>

            <FilterRow items={POSITION_FILTERS} value={posFilter} onChange={setPosFilter} />

        {/* The prospect under the microscope. */}
        {focus ? (
          <Panel highlight={accent.primary} padding={14}>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <Image
                source={{ uri: getPlayerImageUrl(focus) }}
                placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                style={{ width: 46, height: 46, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <Text className="font-extrabold text-white" style={{ fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
                    {focus.name}
                  </Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: COLORS.line }}>
                    <MonoLabel size={8.5} color={COLORS.info} style={{ letterSpacing: 0.4 }}>{formatPositions(focus)}</MonoLabel>
                  </View>
                </View>
                <MonoLabel size={10} color={INK.meta} style={{ marginTop: 3, letterSpacing: 0 }}>
                  {focus.age}a · potencial {draft.reports[focus.id]?.potentialGuess ?? '?'}
                  {draft.reports[focus.id]?.potentialKnown ? '' : '?'}
                </MonoLabel>
              </View>
              <View className="items-end">
                <MonoLabel size={9} color={INK.faint}>Projeção</MonoLabel>
                <Stat size={19} color={CONFIDENCE(draft.reports[focus.id]?.uncertainty ?? 9).color} style={{ marginTop: 1 }}>
                  {draft.reports[focus.id] ? bandText(draft.reports[focus.id]) : '—'}
                </Stat>
              </View>
            </View>

            {draft.reports[focus.id] ? (
              <View style={{ marginTop: 12 }}>
                <ProjectionBand report={draft.reports[focus.id]} />
              </View>
            ) : null}

            {draft.reports[focus.id]?.notes.length ? (
              <Well padding={11} style={{ marginTop: 11, gap: 3 }}>
                {draft.reports[focus.id].notes.map((n, i) => (
                  <Text key={i} style={{ fontSize: 11, lineHeight: 16, color: COLORS.textSoft }}>“{n}”</Text>
                ))}
              </Well>
            ) : (
              <Text style={{ fontSize: 11, lineHeight: 16, color: INK.faint, marginTop: 11, fontStyle: 'italic' }}>
                Nenhum olheiro foi vê-lo ainda. A faixa é o palpite do consenso.
              </Text>
            )}

            <GhostButton
              label={
                draft.reports[focus.id]?.potentialKnown
                  ? '✓ Totalmente avaliado'
                  : draft.scoutBudget <= 0
                    ? 'Sem olheiros disponíveis'
                    : `Escalar olheiro (${draft.reports[focus.id]?.reports ?? 0} idas)`
              }
              onPress={() => onScout(focus.id)}
              disabled={draft.scoutBudget <= 0 || !!draft.reports[focus.id]?.potentialKnown}
              color={draft.reports[focus.id]?.potentialKnown ? COLORS.goodSoft : COLORS.warn}
              padding={10}
              size={10.5}
              style={{ marginTop: 11 }}
            />
          </Panel>
        ) : (
          <Text style={{ fontSize: 12, color: INK.faint, fontStyle: 'italic', paddingHorizontal: 4 }}>
            Nenhum recruta nessa posição.
          </Text>
        )}

        {/* The rest of the board, compact. */}
        {rest.map((p) => {
          const r = draft.reports[p.id];
          const conf = CONFIDENCE(r?.uncertainty ?? 9);
          return (
            <Pressable key={p.id} onPress={() => setFocusId(p.id)} className="active:opacity-80">
              <Panel padding={11}>
                <View className="flex-row items-center" style={{ gap: 11 }}>
                  <Image
                    source={{ uri: getPlayerImageUrl(p) }}
                    placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                    style={{ width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text className="font-extrabold text-white" style={{ fontSize: 12.5 }} numberOfLines={1}>{p.name}</Text>
                    <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 2, letterSpacing: 0 }}>
                      {p.age}a · {formatPositions(p)}
                    </MonoLabel>
                  </View>
                  <Stat size={15} color={conf.color}>{r ? bandText(r) : '—'}</Stat>
                </View>
              </Panel>
            </Pressable>
          );
        })}
          </>
        ) : null}

        {/* Who left the league this offseason — the other half of the cycle the
            draft class is replacing. Collapsed so it never buries the board. */}
        {retirees.length > 0 ? (
          <>
            <Pressable
              onPress={() => setShowRetirees((s) => !s)}
              className="flex-row items-center justify-between active:opacity-70"
              style={{ paddingHorizontal: 3, marginTop: 6 }}
            >
              <MonoLabel>Aposentadorias · {retirees.length}</MonoLabel>
              <MonoLabel size={9} color={COLORS.info}>{showRetirees ? 'Ocultar' : 'Ver'}</MonoLabel>
            </Pressable>

            {showRetirees
              ? retirees.map((p) => {
                  const c = p.career;
                  const avg = c ? careerAverages(c) : null;
                  const honors = c ? honorsSummary(c) : '';
                  return (
                    <Panel key={p.id} bar={COLORS.warn} padding={11}>
                      <View className="flex-row items-center" style={{ gap: 11 }}>
                        <Image
                          source={{ uri: getPlayerImageUrl(p) }}
                          placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                          style={{ width: 34, height: 34, borderRadius: RADIUS.pill, backgroundColor: COLORS.line }}
                          contentFit="cover"
                        />
                        <View style={{ flex: 1 }}>
                          <Text className="font-extrabold text-white" style={{ fontSize: 12.5 }} numberOfLines={1}>{p.name}</Text>
                          <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 2, letterSpacing: 0 }} numberOfLines={1}>
                            {p.age}a · {c?.seasons ?? 0} temp.{avg ? ` · ${avg.ppg.toFixed(1)} PPG` : ''}
                          </MonoLabel>
                          {honors ? (
                            <MonoLabel size={9} color={COLORS.warn} style={{ marginTop: 2, letterSpacing: 0 }} numberOfLines={1}>
                              {honors}
                            </MonoLabel>
                          ) : null}
                        </View>
                        <View className="items-end">
                          <Stat size={17}>{c?.peakOvr ?? p.ovr}</Stat>
                          <MonoLabel size={8.5} color={INK.faint}>Pico</MonoLabel>
                        </View>
                      </View>
                    </Panel>
                  );
                })
              : null}
          </>
        ) : null}

        {/* Board */}
        <SectionLabel>Escolhas · {draft.picks.length}/{draft.order.length}</SectionLabel>
        <Panel padding={11}>
          {[...draft.picks].reverse().map((pick) => {
            const p = players[pick.playerId];
            const t = teams.find((tm) => tm.id === pick.teamId);
            const mine = pick.teamId === userTeamId;
            // Once drafted the truth is public, so the board doubles as the
            // scoreboard of who read the class right.
            const surprise = p?.draftInfo ? draftVerdict(p.ovr, p.draftInfo.projected, p.draftInfo.band) : null;
            const verdict = surprise === 'steal'
              ? { text: '🎯', color: COLORS.goodSoft }
              : surprise === 'bust'
                ? { text: '💀', color: COLORS.bad }
                : null;
            return (
              <View
                key={pick.pick}
                className="flex-row items-center"
                style={{
                  gap: 10, padding: 8, marginBottom: 4, borderRadius: RADIUS.control,
                  backgroundColor: mine ? withAlpha(accent.primary, 0.18) : COLORS.sunken,
                  borderWidth: mine ? 1 : 0,
                  borderColor: accent.primary,
                }}
              >
                <MonoLabel size={10} color={INK.faint} style={{ width: 20, letterSpacing: 0 }}>{pick.pick}</MonoLabel>
                {t ? (
                  <Image source={{ uri: getTeamLogoUrl(t) }} placeholder={{ uri: NBA_FALLBACK }} style={{ width: 22, height: 22 }} contentFit="contain" />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text className="font-bold text-white" style={{ fontSize: 11.5 }} numberOfLines={1}>
                    {p?.name}
                    {verdict ? <Text style={{ color: verdict.color }}> {verdict.text}</Text> : null}
                  </Text>
                  <MonoLabel size={9} color={INK.faint} style={{ marginTop: 2, letterSpacing: 0 }} numberOfLines={1}>
                    {p ? formatPositions(p) : ''} · {p?.ovr} OVR
                    {p?.draftInfo ? ` · proj. ${p.draftInfo.projected}` : ''}
                    {pick.viaTeamId ? ` · via ${pick.viaTeamId.toUpperCase()}` : ''}
                  </MonoLabel>
                </View>
              </View>
            );
          })}
          {draft.picks.length === 0 ? (
            <Text style={{ fontSize: 11, color: INK.faint, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>
              O draft ainda não começou.
            </Text>
          ) : null}
        </Panel>

        <Text style={{ fontSize: 10.5, lineHeight: 15, color: INK.faint, paddingHorizontal: 4 }}>
          Ninguém sabe o que esses garotos vão virar — o número é projeção, não verdade. Cada relatório de olheiro
          estreita a faixa de um recruta, e é justamente nos nebulosos que moram os achados e as furadas.
        </Text>
      </Body>
    </Screen>
  );
};

export default Draft;
