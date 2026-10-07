import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { SeasonState, ScoutReport } from '../types';
import { formatPositions, getTeamAccent } from '../constants';
import { consensusValue, draftVerdict, SCOUT_BUDGET, PROJECTION_FLOOR, PROJECTION_CEIL } from '../services/draftService';
import { COLORS, FONT, withAlpha } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import {
  Panel, MonoLabel, CtaButton, GhostButton, FilterRow, SectionLabel, ScreenTitle, Tag, TeamBadge, BodyText, Name, Dock, Well,
} from '../components/ui/kit';

// Design 3c ("Transmissão"). Nobody knows what these kids become: the number is
// a projection, not the truth. The prospect in focus gets the 60-99 rail with
// his projected range lit on it; every row on the board carries a mini rail, so
// the uncertain ones — where the steals and the busts live — read at a glance.
// Scouting narrows a range, and the scouting budget is the real constraint.

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

const RAIL_MIN = PROJECTION_FLOOR;
const RAIL_MAX = PROJECTION_CEIL;

const CONFIDENCE = (u: number) =>
  u === 0 ? { label: 'Definido', color: COLORS.good }
    : u <= 3 ? { label: 'Confiável', color: COLORS.good }
      : u <= 6 ? { label: 'Incerto', color: COLORS.warn }
        : { label: 'Nebuloso', color: COLORS.bad };

const lo = (r: ScoutReport) => r.estimate - r.uncertainty;
const hi = (r: ScoutReport) => r.estimate + r.uncertainty;
const bandText = (r: ScoutReport) => (r.uncertainty === 0 ? `${r.estimate}` : `${lo(r)}–${hi(r)}`);
const pct = (v: number) => Math.max(0, Math.min(1, (v - RAIL_MIN) / (RAIL_MAX - RAIL_MIN)));

/** The 60→99 rail, gridded every 10, with the projected range lit on it. */
const ProjectionRail: React.FC<{ report: ScoutReport }> = ({ report }) => {
  const conf = CONFIDENCE(report.uncertainty);
  const l = pct(lo(report));
  const w = Math.max(0.025, pct(hi(report)) - l);
  const ticks = [70, 80, 90];
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 16, borderRadius: 4, backgroundColor: COLORS.surface2 }}>
        {ticks.map((t) => (
          <View key={t} style={{ position: 'absolute', left: `${pct(t) * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: COLORS.line }} />
        ))}
        <View
          style={{
            position: 'absolute', left: `${l * 100}%`, width: `${w * 100}%`, top: 0, bottom: 0, borderRadius: 4,
            backgroundColor: withAlpha(conf.color, 0.35), borderWidth: 1, borderColor: conf.color,
          }}
        />
      </View>
      <View className="flex-row justify-between">
        {[RAIL_MIN, 70, 80, 90, RAIL_MAX].map((t) => (
          <Text key={t} style={{ fontFamily: FONT.cond600, fontSize: 11, color: COLORS.faint }}>{t}</Text>
        ))}
      </View>
    </View>
  );
};

/** The board's mini rail: green when tight, warn when loose, grey when it is anyone's guess. */
const MiniRail: React.FC<{ report?: ScoutReport }> = ({ report }) => {
  if (!report) return <View style={{ flex: 1, height: 8, borderRadius: 3, backgroundColor: COLORS.surface2 }} />;
  const width = hi(report) - lo(report);
  const color = width <= 8 ? COLORS.good : width <= 14 ? COLORS.warn : '#4A4950';
  const l = pct(lo(report));
  return (
    <View style={{ flex: 1, height: 8, borderRadius: 3, backgroundColor: COLORS.surface2 }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 3, left: `${l * 100}%`, width: `${Math.max(0.03, pct(hi(report)) - l) * 100}%`, backgroundColor: color }} />
    </View>
  );
};

const Draft: React.FC<DraftProps> = ({ season, onPick, onAutoPick, onFinish, onScout }) => {
  const [posFilter, setPosFilter] = useState('TODOS');
  const [focusId, setFocusId] = useState<string | null>(null);
  const { teams, players, userTeamId, draft } = season;
  const userTeam = teams.find((t) => t.id === userTeamId);

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

  if (!draft || !userTeam) return null;

  const onClockSlot = draft.complete ? null : draft.order[draft.picks.length];
  const userOnClock = onClockSlot?.teamId === userTeamId;
  const overallPick = draft.picks.length + 1;
  // The user's next slot on the board, and how far away it is.
  const nextUserIndex = draft.order.findIndex((slot, i) => i >= draft.picks.length && slot.teamId === userTeamId);
  const picksAway = nextUserIndex === -1 ? -1 : nextUserIndex - draft.picks.length;

  const filtered = posFilter === 'TODOS'
    ? available
    : available.filter((p) => (p.positions || [p.pos]).includes(posFilter));

  const focus = filtered.find((p) => p.id === focusId) ?? filtered[0];
  const focusReport = focus ? draft.reports[focus.id] : undefined;
  const focusRank = focus ? available.findIndex((p) => p.id === focus.id) + 1 : 0;
  const conf = CONFIDENCE(focusReport?.uncertainty ?? 9);

  const queue = draft.order
    .map((slot, i) => ({ slot, number: i + 1 }))
    .slice(Math.max(0, draft.picks.length - 2), draft.picks.length + 4);

  const subtitle = draft.complete
    ? `Encerrado · ${draft.picks.length} recrutas selecionados`
    : userOnClock
      ? `Sua vez · ${overallPick}ª escolha`
      : nextUserIndex === -1
        ? 'Você não tem mais escolhas neste draft'
        : `Você escolhe na ${nextUserIndex + 1}ª · faltam ${picksAway}`;

  return (
    <Screen
      heroHeight={110}
      footer={
        <Dock>
          {draft.complete ? (
            <CtaButton label="Agência livre" sub="Próxima fase" onPress={onFinish} />
          ) : (
            // The staff picks for you (the CPU runs the board up to your slot on
            // its own, so you are on the clock whenever the draft is open).
            <GhostButton filled label="Deixar pra staff escolher" onPress={onAutoPick} disabled={!userOnClock} />
          )}
        </Dock>
      }
    >
      <ScreenTitle
        title={`Draft · classe ${season.awardHistory.length || 1}`}
        right={
          !draft.complete ? (
            <View className="items-end">
              <Text style={{ fontFamily: FONT.cond800, fontSize: 30, lineHeight: 30, color: draft.scoutBudget > 0 ? COLORS.text : COLORS.bad }}>{draft.scoutBudget}</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.5, color: COLORS.muted }}>RELATÓRIOS</Text>
            </View>
          ) : undefined
        }
      />
      <BodyText size={14} style={{ paddingHorizontal: 20, marginTop: -10 }}>{subtitle}</BodyText>

      <Body top={14} gap={14}>
        {!draft.complete ? (
          <>
            {/* Who is on the clock, and who's next. */}
            <View className="flex-row flex-wrap" style={{ gap: 5 }}>
              {queue.map(({ slot, number }) => {
                const onClock = number === overallPick;
                const mine = slot.teamId === userTeamId;
                return (
                  <View
                    key={number}
                    className="flex-row items-center"
                    style={{
                      gap: 5, paddingHorizontal: 8, height: 28, borderRadius: 8,
                      backgroundColor: onClock ? COLORS.ctaFill : COLORS.surface2,
                      borderWidth: mine && !onClock ? 1 : 0, borderColor: getTeamAccent(userTeamId).primary,
                      opacity: number < overallPick ? 0.45 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.cond700, fontSize: 12, color: onClock ? COLORS.ctaInk : COLORS.muted }}>{number}</Text>
                    <Text style={{ fontFamily: FONT.cond800, fontSize: 12, color: onClock ? COLORS.ctaInk : COLORS.text }}>{slot.teamId.toUpperCase()}</Text>
                  </View>
                );
              })}
            </View>

            <FilterRow items={POSITION_FILTERS} value={posFilter} onChange={setPosFilter} />

            {/* The prospect under the microscope. */}
            {focus ? (
              <Panel padding={16} radius={20} style={{ gap: 12 }}>
                <View className="flex-row justify-between items-start" style={{ gap: 10 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <MonoLabel size={9}>#{focusRank} no board · {formatPositions(focus)} · {focus.age} anos</MonoLabel>
                    <Text numberOfLines={2} style={{ fontFamily: FONT.cond800, fontSize: 28, lineHeight: 28, color: COLORS.text, textTransform: 'uppercase' }}>{focus.name}</Text>
                    <BodyText size={13}>
                      Potencial {focusReport?.potentialGuess ?? '?'}{focusReport?.potentialKnown ? '' : '?'}
                    </BodyText>
                  </View>
                  <Tag color={conf.color}>{conf.label}</Tag>
                </View>

                {focusReport ? (
                  <View style={{ gap: 6 }}>
                    <View className="flex-row justify-between items-baseline">
                      <MonoLabel size={9}>Projeção</MonoLabel>
                      <Text style={{ fontFamily: FONT.cond800, fontSize: 22, color: COLORS.text }}>{bandText(focusReport)}</Text>
                    </View>
                    <ProjectionRail report={focusReport} />
                  </View>
                ) : null}

                {focusReport?.notes.length ? (
                  <Well style={{ gap: 3 }}>
                    {focusReport.notes.map((n, i) => (
                      <BodyText key={i} size={12.5} color={COLORS.textSoft}>“{n}”</BodyText>
                    ))}
                  </Well>
                ) : (
                  <BodyText size={12.5} color={COLORS.dim}>Nenhum olheiro foi vê-lo ainda. A faixa é o palpite do consenso.</BodyText>
                )}

                <View className="flex-row" style={{ gap: 8 }}>
                  <GhostButton
                    label={focusReport?.potentialKnown ? 'Avaliado ✓' : draft.scoutBudget <= 0 ? 'Sem olheiros' : 'Observar (–1)'}
                    // Pin the focus first: scouting moves his projected range,
                    // the board re-sorts, and an unpinned focus (board #1)
                    // would jump to someone else right under the Escolher button.
                    onPress={() => { setFocusId(focus.id); onScout(focus.id); }}
                    disabled={draft.scoutBudget <= 0 || !!focusReport?.potentialKnown}
                    style={{ flex: 1 }}
                  />
                  <CtaButton
                    label={userOnClock ? `Escolher ${focus.name.split(' ').slice(-1)[0]}` : 'Aguarde a vez'}
                    onPress={() => onPick(focus.id)}
                    disabled={!userOnClock}
                    size={16}
                    style={{ flex: 1.3, minHeight: 46 }}
                  />
                </View>
              </Panel>
            ) : (
              <BodyText color={COLORS.dim}>Nenhum recruta nessa posição.</BodyText>
            )}

            {/* The board. */}
            <View>
              <SectionLabel>Board da liga · {available.length}</SectionLabel>
              <View style={{ marginTop: 4 }}>
                {filtered.map((p) => {
                  const r = draft.reports[p.id];
                  const on = p.id === focus?.id;
                  return (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      onPress={() => setFocusId(p.id)}
                      className="flex-row items-center active:opacity-75"
                      style={{ height: 46, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft, backgroundColor: on ? COLORS.surface : 'transparent' }}
                    >
                      <Text style={{ width: 20, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 14, color: COLORS.dim }}>
                        {available.findIndex((x) => x.id === p.id) + 1}
                      </Text>
                      <View style={{ width: 110, minWidth: 0, gap: 1 }}>
                        <Name size={14.5}>{p.name}</Name>
                        <Text style={{ fontFamily: FONT.body500, fontSize: 11.5, color: COLORS.dim }}>{formatPositions(p)} · {p.age}a</Text>
                      </View>
                      <MiniRail report={r} />
                      <Text style={{ width: 46, textAlign: 'right', fontFamily: FONT.cond700, fontSize: 14, color: COLORS.textSoft }}>{r ? bandText(r) : '—'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        {/* The picks so far. */}
        <View>
          <SectionLabel>Escolhas · {draft.picks.length}/{draft.order.length}</SectionLabel>
          <View style={{ marginTop: 4 }}>
            {[...draft.picks].reverse().map((pick) => {
              const p = players[pick.playerId];
              const mine = pick.teamId === userTeamId;
              const surprise = p?.draftInfo ? draftVerdict(p.ovr, p.draftInfo.projected, p.draftInfo.band) : null;
              return (
                <View
                  key={pick.pick}
                  className="flex-row items-center"
                  style={{
                    height: 46, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft,
                    backgroundColor: mine ? withAlpha(getTeamAccent(userTeamId).primary, 0.14) : 'transparent',
                  }}
                >
                  <Text style={{ width: 20, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 14, color: COLORS.dim }}>{pick.pick}</Text>
                  <TeamBadge teamId={pick.teamId} width={34} height={20} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Name size={14.5}>{p?.name}</Name>
                    <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 11.5, color: COLORS.dim }}>
                      {p ? formatPositions(p) : ''}{p?.draftInfo ? ` · proj. ${p.draftInfo.projected}` : ''}{pick.viaTeamId ? ` · via ${pick.viaTeamId.toUpperCase()}` : ''}
                    </Text>
                  </View>
                  {surprise === 'steal' ? <Tag color={COLORS.good}>Achado</Tag> : surprise === 'bust' ? <Tag color={COLORS.bad}>Furada</Tag> : null}
                  <Text style={{ width: 28, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text }}>{p?.ovr}</Text>
                </View>
              );
            })}
            {draft.picks.length === 0 ? <BodyText color={COLORS.dim} style={{ paddingVertical: 10 }}>O draft ainda não começou.</BodyText> : null}
          </View>
        </View>

        <BodyText size={12} color={COLORS.dim}>
          Ninguém sabe o que esses garotos vão virar — o número é projeção, não verdade. Cada relatório de olheiro
          ({SCOUT_BUDGET} por draft) estreita a faixa de um recruta, e é nos nebulosos que moram os achados e as furadas.
        </BodyText>
      </Body>
    </Screen>
  );
};

export default Draft;
