import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';

import { Team, Player, Coach, GmLegacy, OwnerExpectation } from '../types';
import {
  getTeamLogoUrl, getTeamSalary, SALARY_CAP, getTeamNickname, conferenceLabel, coachOf,
  getTeamCity, getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG,
} from '../constants';
import { MIN_ROSTER_SIZE } from '../services/tradeService';
import { simulationEngine, DEFAULT_ROTATION_SIZE } from '../services/simulationService';
import { COLORS, INK, RADIUS, FONT, withAlpha, onAccent, ovrColor } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { teamRating } from '../services/formService';
import Screen, { HeroBackdrop, Body } from '../components/ui/Screen';
import {
  Panel, MonoLabel, Eyebrow, HeroTitle, Stat, Meter, CtaButton, GhostButton, SectionLabel, StatTile,
  StatStrip, Dock, Name, BodyText,
} from '../components/ui/kit';
import RosterRow from '../components/ui/RosterRow';
import StartersCourt from '../components/StartersCourt';
import TeamAnalytics from '../components/TeamAnalytics';
import TeamComparisonChart from '../components/TeamComparisonChart';
import PickAssets from '../components/PickAssets';
import CoachPanel from '../components/CoachPanel';
import RotationPanel from '../components/RotationPanel';
import Icon from '../components/Icon';
import PlayerDetailModal from '../components/PlayerDetailModal';

// Design 1c of "Transmissão" (was design 2a) — elenco, rotação and técnico on one screen. The mockup shows three
// segments doing exactly that; the real hub also carries draft capital, team
// analytics and the rival comparison, which is why there's a fourth. Splitting
// them is the whole point: this screen used to be a single ~2000px scroll where
// the roster (the thing you open it for) sat below four other panels.

type Tab = 'roster' | 'rotation' | 'coach' | 'analysis';

const TABS: { id: Tab; label: string }[] = [
  { id: 'roster', label: 'Elenco' },
  { id: 'rotation', label: 'Rotação' },
  { id: 'coach', label: 'Técnico' },
  { id: 'analysis', label: 'Análise' },
];

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

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

/** "Jaren Jackson Jr." → "Jackson". */
const surname = (name: string) =>
  name.split(' ').filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).slice(-1)[0] ?? name;

// The minutes bar is drawn against a full game, not against 40: the sim hands
// its stars 41-43 mpg, and a 40-minute ceiling pinned every one of them to a
// full bar — erasing the difference the bar exists to show.
const MINUTES_IN_A_GAME = 48;

const MyTeamHub: React.FC<MyTeamHubProps> = ({
  team, players, allTeams, coaches, gmLegacy, owner, currentDraft,
  onWaive, onSetStarter, onFireCoach, onHireCoach, onSetRotationSize, onToggleLoadManagement,
}) => {
  const [tab, setTab] = useState<Tab>('roster');
  const insets = useSafeAreaInsets();
  const { accent } = useTheme();
  const heroInk = onAccent(accent.primary);
  const [confirmWaive, setConfirmWaive] = useState<Player | null>(null);
  const [viewing, setViewing] = useState<Player | null>(null);
  const [rivalId, setRivalId] = useState<string | null>(null);
  const [rivalPickerOpen, setRivalPickerOpen] = useState(false);
  const rival = allTeams.find((t) => t.id === rivalId) || null;
  const coach = coachOf(team, coaches);

  const salary = getTeamSalary(team, players);
  const capSpace = SALARY_CAP - salary;

  const roster = team.roster.map((pId) => players[pId]).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
  const canWaive = team.roster.length > MIN_ROSTER_SIZE;
  const rotationSize = team.rotationSize ?? DEFAULT_ROTATION_SIZE;

  const chemistry = Math.round(simulationEngine.teamChemistry(team, players));
  const chemColor = chemistry >= 70 ? COLORS.good : chemistry >= 45 ? COLORS.warn : COLORS.bad;

  const absences = team.playerAbsences ?? {};
  const loadManaged = new Set(team.loadManagedIds ?? []);

  // Header numbers: the same star-weighted rating as the franchise badge, and
  // the rotation's offense/defense the engine plays with.
  const rotationIds = simulationEngine.getTeamRotation(team, players, rotationSize);
  const rot = rotationIds.map((id) => players[id]).filter(Boolean);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const teamOff = avg(rot.slice(0, 8).map((p) => p.off));
  const teamDef = avg(rot.slice(0, 8).map((p) => p.def));
  const gamesIn = (team.wins ?? 0) + (team.losses ?? 0);
  const confRank = [...allTeams.filter((t) => t.conference === team.conference)]
    .sort((a, b) => ((b.wins ?? 0) - (b.losses ?? 0)) - ((a.wins ?? 0) - (a.losses ?? 0)))
    .findIndex((t) => t.id === team.id) + 1;

  // The five the sim starts tonight, then everyone else.
  const lineup = simulationEngine.getLineup(team, players).slots;
  const starterIds = new Set(lineup.map((s) => s.playerId).filter((id): id is string => !!id));
  const bench = roster.filter((p) => !starterIds.has(p.id));

  // Payroll as one stacked bar: every contract a segment, biggest first, in
  // shades of the team color; the white tick is the cap.
  const contracts = [...roster].sort((a, b) => b.salary - a.salary);
  const deadTotal = (team.deadMoney ?? []).reduce((sum, d) => sum + d.amount, 0);
  const scale = Math.max(salary, SALARY_CAP) * 1.04;
  const shades = [1, 0.82, 0.66, 0.52, 0.4, 0.3];

  return (
    <Screen
      heroHeight={170}
      backdrop={<HeroBackdrop height={170 + insets.top} primary={accent.primary} secondary={accent.secondary} />}
      footer={
        tab === 'roster' ? (
          <Dock>
            <CtaButton label="Editar rotação" sub={`${rotationSize} no giro`} onPress={() => setTab('rotation')} />
          </Dock>
        ) : undefined
      }
    >
      {/* ------------------------------------------------- franchise block */}
      <View style={{ height: 170 - 6, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 22, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <Text
          style={{
            position: 'absolute', right: -14, bottom: -40, fontFamily: FONT.cond800, fontSize: 150, lineHeight: 150,
            color: withAlpha(heroInk === '#ffffff' ? '#ffffff' : '#000000', 0.13),
          }}
        >
          {team.id.toUpperCase()}
        </Text>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 2.4, color: withAlpha(heroInk === '#ffffff' ? '#ffffff' : '#000000', 0.8) }}>
          MEU TIME
        </Text>
        <HeroTitle size={48} color={heroInk} numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4 }}>
          {getTeamNickname(team)}
        </HeroTitle>
        <Text style={{ fontFamily: FONT.body500, fontSize: 14, color: withAlpha(heroInk === '#ffffff' ? '#ffffff' : '#000000', 0.88), marginTop: 4 }} numberOfLines={1}>
          {getTeamCity(team)} · {team.wins ?? 0}–{team.losses ?? 0}{gamesIn > 0 ? ` · ${confRank}º ${team.conference === 'East' ? 'Leste' : 'Oeste'}` : ''}
        </Text>
      </View>

      {/* ------------------------------------------------------ stat strip */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 10, marginTop: 6 }}>
        <StatStrip
          size={30}
          items={[
            { label: 'Geral', value: teamRating(team, players) },
            { label: 'Ataque', value: teamOff },
            { label: 'Defesa', value: teamDef },
            { label: 'Química', value: chemistry, color: chemColor },
          ]}
        />
      </View>

      {/* ------------------------------------------------------------- tabs */}
      <View className="flex-row" style={{ paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              aria-selected={active}
              onPress={() => setTab(t.id)}
              className="active:opacity-75"
              style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: FONT.cond700, fontSize: 14, letterSpacing: 1.4, color: active ? COLORS.text : COLORS.dim, textTransform: 'uppercase' }}>
                {t.label}
              </Text>
              {active ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: COLORS.text }} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Body top={16} gap={16}>
        {tab === 'roster' ? (
          <>
            {/* --------------------------------------------------- the five */}
            <View style={{ gap: 9 }}>
              <SectionLabel right={
                <Pressable onPress={() => setTab('rotation')} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.2, color: COLORS.east }}>EDITAR</Text>
                </Pressable>
              }>
                Quinteto titular
              </SectionLabel>
              <View className="flex-row" style={{ gap: 6 }}>
                {lineup.map((slot) => {
                  const p = slot.playerId ? players[slot.playerId] : undefined;
                  return (
                    <Pressable
                      key={slot.pos}
                      accessibilityRole="button"
                      onPress={() => p && setViewing(p)}
                      className="active:opacity-75"
                      style={{ flex: 1, minWidth: 0, backgroundColor: COLORS.surface, borderRadius: 12, overflow: 'hidden' }}
                    >
                      <View style={{ height: 76, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'flex-end' }}>
                        {p ? (
                          <Image source={{ uri: getPlayerImageUrl(p) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: '100%', height: 70 }} contentFit="cover" contentPosition="top" />
                        ) : null}
                        <Text style={{ position: 'absolute', top: 5, left: 6, fontFamily: FONT.cond800, fontSize: 11, letterSpacing: 0.6, color: COLORS.muted }}>
                          {slot.bucket}
                        </Text>
                      </View>
                      <View style={{ paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8 }}>
                        <Text style={{ fontFamily: FONT.cond800, fontSize: 24, lineHeight: 24, color: p ? ovrColor(p.ovr) : COLORS.dim }}>
                          {p?.ovr ?? '—'}
                        </Text>
                        <Text numberOfLines={1} style={{ fontFamily: FONT.cond600, fontSize: 12, color: COLORS.text }}>
                          {p ? surname(p.name) : 'Vago'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* -------------------------------------------------- payroll */}
            <Panel padding={14} style={{ gap: 9 }}>
              <View className="flex-row justify-between items-baseline">
                <MonoLabel size={10}>Folha salarial</MonoLabel>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text }}>
                  {money(salary)}{' '}
                  <Text style={{ fontFamily: FONT.cond600, fontSize: 13, color: capSpace < 0 ? COLORS.warn : COLORS.good }}>
                    {capSpace < 0 ? `+${money(-capSpace)} acima do teto` : `${money(capSpace)} de espaço`}
                  </Text>
                </Text>
              </View>
              <View style={{ height: 14, flexDirection: 'row', gap: 2 }}>
                {contracts.map((p, i) => (
                  <View
                    key={p.id}
                    style={{
                      height: 14, borderRadius: 2, width: `${(p.salary / scale) * 100}%`,
                      backgroundColor: i < shades.length ? withAlpha(accent.primary, shades[i]) : '#2A2A30',
                    }}
                  />
                ))}
                {deadTotal > 0 ? (
                  <View style={{ height: 14, borderRadius: 2, width: `${(deadTotal / scale) * 100}%`, backgroundColor: withAlpha(COLORS.bad, 0.5) }} />
                ) : null}
                <View style={{ position: 'absolute', left: `${(SALARY_CAP / scale) * 100}%`, top: -4, bottom: -4, width: 2, backgroundColor: COLORS.text }} />
              </View>
              <View className="flex-row justify-between">
                <BodyText size={12} numberOfLines={1} style={{ flex: 1 }}>
                  {contracts.slice(0, 3).map((p) => `${surname(p.name)} ${money(p.salary)}`).join(' · ')}
                </BodyText>
                <BodyText size={12}>teto ▏</BodyText>
              </View>
              {deadTotal > 0 ? (
                <BodyText size={12} color={COLORS.warn}>
                  Dinheiro morto: {(team.deadMoney ?? []).map((d) => `${d.name} ${money(d.amount)} (${d.years}a)`).join(' · ')}
                </BodyText>
              ) : null}
            </Panel>

            {/* ---------------------------------------------------- bench */}
            <View>
              <SectionLabel>Banco · {bench.length} jogadores</SectionLabel>
              <View style={{ marginTop: 6 }}>
                {bench.map((p) => {
                  const absence = absences[p.id];
                  const mpg = p.seasonStats?.mpg ?? 0;
                  const managed = loadManaged.has(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      onPress={() => setViewing(p)}
                      className="flex-row items-center active:opacity-75"
                      style={{ height: 48, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}
                    >
                      <Text style={{ width: 24, fontFamily: FONT.cond800, fontSize: 12, color: COLORS.dim }}>{p.pos}</Text>
                      <View className="flex-1" style={{ minWidth: 0, gap: 2 }}>
                        <Name size={15}>{p.name}</Name>
                        <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 12, color: absence ? COLORS.bad : COLORS.dim }}>
                          {absence
                            ? `Fora ${absence.duration} ${absence.duration === 1 ? 'jogo' : 'jogos'} · ${absence.reason === 'injury' ? 'lesionado' : 'suspenso'}`
                            : `${p.age} anos · ${money(p.salary)} · ${p.nextSalary !== undefined ? 'estendido' : p.contractYears === 1 ? 'último ano' : `${p.contractYears} anos`}${managed ? ' · carga' : ''}`}
                        </Text>
                      </View>
                      <View style={{ width: 58, gap: 3, alignItems: 'flex-end' }}>
                        <Text style={{ fontFamily: FONT.cond600, fontSize: 11, color: COLORS.muted }}>{mpg > 0 ? `${Math.round(mpg)} MIN` : '— MIN'}</Text>
                        <View style={{ width: '100%', height: 3, borderRadius: 2, backgroundColor: COLORS.lineStrong }}>
                          <View style={{ height: '100%', borderRadius: 2, backgroundColor: accent.primary, width: `${Math.min(1, mpg / MINUTES_IN_A_GAME) * 100}%` }} />
                        </View>
                      </View>
                      <Text style={{ width: 30, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 20, color: ovrColor(p.ovr) }}>{p.ovr}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <BodyText size={12} color={COLORS.dim} style={{ marginTop: 10 }}>
                Toque num jogador para ver a ficha completa — estatísticas, carreira, atributos e contrato — ou dispensá-lo.
              </BodyText>
            </View>
          </>
        ) : null}

        {tab === 'rotation' ? (
          <>
            <StartersCourt team={team} players={players} onSetStarter={onSetStarter} />
            <RotationPanel
              team={team}
              players={players}
              onSetRotationSize={onSetRotationSize}
              onToggleLoadManagement={onToggleLoadManagement}
            />
          </>
        ) : null}

        {tab === 'coach' ? (
          <>
            <CoachPanel team={team} coaches={coaches} editable onFire={onFireCoach} onHire={onHireCoach} />

            {/* What the owner is measuring the coach — and you — against. */}
            <Panel bar={owner.confidence >= 60 ? COLORS.goodSoft : owner.confidence >= 35 ? COLORS.warn : COLORS.cta} padding={14}>
              <MonoLabel>Diretoria</MonoLabel>
              <View className="flex-row items-baseline" style={{ gap: 8, marginTop: 6 }}>
                <Stat size={24} color={owner.confidence >= 60 ? COLORS.goodSoft : owner.confidence >= 35 ? COLORS.warn : COLORS.bad}>
                  {owner.confidence}%
                </Stat>
                <Text className="font-semibold" style={{ fontSize: 11, color: INK.body }}>de confiança</Text>
              </View>
              <Meter
                value={owner.confidence / 100}
                color={owner.confidence >= 60 ? COLORS.good : owner.confidence >= 35 ? COLORS.warn : COLORS.cta}
                style={{ marginTop: 9 }}
              />
              {owner.note ? (
                <Text style={{ fontSize: 11, lineHeight: 16, color: INK.body, marginTop: 10 }}>“{owner.note}”</Text>
              ) : null}
            </Panel>

            {coach ? (
              <View className="flex-row" style={{ gap: 10 }}>
                <StatTile label="Ataque" value={coach.offense} bar={COLORS.info} />
                <StatTile label="Defesa" value={coach.defense} bar={COLORS.info} />
                <StatTile label="Desenv." value={coach.development} bar={COLORS.goodSoft} />
              </View>
            ) : null}
          </>
        ) : null}

        {tab === 'analysis' ? (
          <>
            <Panel padding={14}>
              <PickAssets team={team} teams={allTeams} currentDraft={currentDraft} title="Seu capital de draft" />
            </Panel>

            <TeamAnalytics team={team} players={players} />

            <View className="flex-row items-center justify-between" style={{ gap: 12, marginTop: 4 }}>
              <SectionLabel>Comparar com rival</SectionLabel>
              <Pressable accessibilityRole="button"
                onPress={() => setRivalPickerOpen(true)}
                className="flex-row items-center active:opacity-70"
                style={{
                  gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.control,
                  backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line,
                }}
              >
                <Text className="font-bold text-white" style={{ fontSize: 11 }}>
                  {rival ? getTeamNickname(rival) : 'Selecione'}
                </Text>
                <Icon name="chevron-down" size={13} color={COLORS.navIdle} />
              </Pressable>
            </View>
            <TeamComparisonChart team1={team} team2={rival} players={players} />
          </>
        ) : null}
      </Body>

      {/* Rival picker */}
      <Modal visible={rivalPickerOpen} transparent animationType="slide" onRequestClose={() => setRivalPickerOpen(false)}>
        <Pressable accessible={false} className="flex-1 bg-black/70 justify-end" onPress={() => setRivalPickerOpen(false)}>
          <Pressable
            className="rounded-t-3xl p-4 max-h-[70%]"
            style={{ backgroundColor: COLORS.navBg, borderTopWidth: 1, borderTopColor: COLORS.navLine }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="w-10 h-1 rounded-full self-center mb-4" style={{ backgroundColor: COLORS.line }} />
            <MonoLabel style={{ marginBottom: 10 }}>Comparar com</MonoLabel>
            <ScrollView>
              {allTeams.filter((t) => t.id !== team.id).map((t) => (
                <Pressable accessibilityRole="button"
                  key={t.id}
                  onPress={() => { setRivalId(t.id); setRivalPickerOpen(false); }}
                  className="flex-row items-center gap-3 p-3 rounded-xl active:opacity-70"
                >
                  <Image source={{ uri: getTeamLogoUrl(t) }} style={{ width: 26, height: 26 }} contentFit="contain" />
                  <Text className="text-sm font-bold text-white">{t.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Waive confirmation */}
      {viewing ? (
        <PlayerDetailModal
          player={players[viewing.id] ?? viewing}
          onClose={() => setViewing(null)}
          status={absences[viewing.id]
            ? `Fora ${absences[viewing.id].duration} ${absences[viewing.id].duration === 1 ? 'jogo' : 'jogos'} · ${absences[viewing.id].reason === 'injury' ? 'lesionado' : 'suspenso'}`
            : undefined}
          actions={[{
            label: 'Dispensar',
            tone: 'danger',
            disabled: !canWaive,
            sub: canWaive
              ? (viewing.contractYears > 0 ? `O salário dele vira dinheiro morto na folha (${money(viewing.salary)} por ${viewing.contractYears} ${viewing.contractYears === 1 ? 'ano' : 'anos'}).` : 'Sem contrato: não sobra nada na folha.')
              : `O elenco precisa de no mínimo ${MIN_ROSTER_SIZE} jogadores.`,
            onPress: () => { setConfirmWaive(viewing); setViewing(null); },
          }]}
        />
      ) : null}

      <Modal visible={confirmWaive !== null} transparent animationType="fade" onRequestClose={() => setConfirmWaive(null)}>
        <Pressable accessible={false} className="flex-1 bg-black/70 items-center justify-center p-4" onPress={() => setConfirmWaive(null)}>
          <Pressable
            className="w-full max-w-sm"
            style={{ backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line, borderRadius: RADIUS.hero, padding: 20, gap: 14 }}
            onPress={(e) => e.stopPropagation()}
          >
            <HeroTitle size={19}>Dispensar jogador?</HeroTitle>
            <Text style={{ fontSize: 12.5, lineHeight: 19, color: INK.body }}>
              <Text className="font-bold text-white">{confirmWaive?.name}</Text> vira agente livre e abre uma vaga no elenco.
              {confirmWaive && confirmWaive.contractYears > 0
                ? ` O contrato continua sendo pago: ${money(confirmWaive.salary)} por ano fica na sua folha como dinheiro morto por mais ${confirmWaive.contractYears} ${confirmWaive.contractYears === 1 ? 'temporada' : 'temporadas'}.`
                : ' Ele está sem contrato, então não sobra nada na folha.'}
            </Text>
            <View className="flex-row" style={{ gap: 10 }}>
              <GhostButton label="Cancelar" onPress={() => setConfirmWaive(null)} style={{ flex: 1 }} />
              <CtaButton
                label="Dispensar"
                onPress={() => { if (confirmWaive) onWaive(confirmWaive.id); setConfirmWaive(null); }}
                size={13}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
};

export default MyTeamHub;
