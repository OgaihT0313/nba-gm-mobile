import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';

import { Team, Player, Coach, GmLegacy, OwnerExpectation } from '../types';
import {
  getTeamLogoUrl, getTeamSalary, SALARY_CAP, getTeamNickname, conferenceLabel, coachOf,
} from '../constants';
import { MIN_ROSTER_SIZE } from '../services/tradeService';
import { simulationEngine, DEFAULT_ROTATION_SIZE } from '../services/simulationService';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import {
  Panel, MonoLabel, Eyebrow, HeroTitle, Stat, Meter, CtaButton, GhostButton, SectionLabel, StatTile,
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

// Design 2a — elenco, rotação and técnico on one screen. The mockup shows three
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

// The minutes bar is drawn against a full game, not against 40: the sim hands
// its stars 41-43 mpg, and a 40-minute ceiling pinned every one of them to a
// full bar — erasing the difference the bar exists to show.
const MINUTES_IN_A_GAME = 48;

const MyTeamHub: React.FC<MyTeamHubProps> = ({
  team, players, allTeams, coaches, gmLegacy, owner, currentDraft,
  onWaive, onSetStarter, onFireCoach, onHireCoach, onSetRotationSize, onToggleLoadManagement,
}) => {
  const [tab, setTab] = useState<Tab>('roster');
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
  const chemColor = chemistry >= 70 ? COLORS.goodSoft : chemistry >= 45 ? COLORS.warn : COLORS.bad;

  const absences = team.playerAbsences ?? {};
  const loadManaged = new Set(team.loadManagedIds ?? []);

  return (
    <Screen
      heroHeight={186}
      footer={
        tab === 'roster' ? (
          <CtaButton
            label="Editar rotação"
            sub={`${rotationSize} jogadores no giro`}
            onPress={() => setTab('rotation')}
          />
        ) : undefined
      }
    >
      <HeroContent>
        <Eyebrow>Meu time</Eyebrow>
        <View className="flex-row items-center" style={{ gap: 13, marginTop: 11 }}>
          <Image source={{ uri: getTeamLogoUrl(team) }} style={{ width: 52, height: 52 }} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <HeroTitle size={25} numberOfLines={1} adjustsFontSizeToFit>{getTeamNickname(team)}</HeroTitle>
            <MonoLabel size={10} color="rgba(255,255,255,0.7)" style={{ marginTop: 4, letterSpacing: 0.4 }} numberOfLines={1}>
              {roster.length} jogadores · {team.wins ?? 0}-{team.losses ?? 0} · {conferenceLabel(team)}
            </MonoLabel>
          </View>
        </View>

        {/* Segments, over the hero — the mockup's three pills, plus Análise. */}
        <View className="flex-row" style={{ gap: 6, marginTop: 16 }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <Pressable accessibilityRole="button"
                key={t.id}
                onPress={() => setTab(t.id)}
                className="active:opacity-70"
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderRadius: RADIUS.control,
                  backgroundColor: active ? 'rgba(0,0,0,0.35)' : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? 'rgba(255,255,255,0.18)' : 'transparent',
                }}
              >
                <Text
                  className={active ? 'font-extrabold' : 'font-bold'}
                  style={{ fontSize: 10.5, color: active ? '#fff' : 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </HeroContent>

      <Body top={16}>
        {tab === 'roster' ? (
          <>
            <View className="flex-row" style={{ gap: 10 }}>
              <StatTile
                label="Cap space"
                value={capSpace >= 0 ? money(capSpace) : `-${money(Math.abs(capSpace))}`}
                sub={`${money(salary)} usados`}
                color={capSpace >= 0 ? COLORS.goodSoft : COLORS.warn}
                bar={capSpace >= 0 ? COLORS.goodSoft : COLORS.warn}
              />
              <StatTile
                label="Química"
                value={`${chemistry}%`}
                sub={chemistry >= 70 ? 'Unido' : chemistry >= 45 ? 'Tenso' : 'Rachado'}
                color={chemColor}
                bar={chemColor}
              />
              <StatTile
                label="Legado"
                value={gmLegacy.titles}
                sub={`${gmLegacy.seasons} temp.`}
                color={gmLegacy.titles > 0 ? COLORS.warn : COLORS.text}
                bar={COLORS.warn}
              />
            </View>
            {(team.deadMoney ?? []).length > 0 ? (
              <MonoLabel size={9.5} color={COLORS.warn} style={{ letterSpacing: 0, marginTop: -2 }}>
                Dinheiro morto na folha: {(team.deadMoney ?? []).map((d) => `${d.name} ${money(d.amount)} (${d.years}a)`).join(' · ')}
              </MonoLabel>
            ) : null}

            <SectionLabel>Elenco · {roster.length} jogadores</SectionLabel>
            {roster.map((p) => {
              const absence = absences[p.id];
              const mpg = p.seasonStats?.mpg ?? 0;
              const managed = loadManaged.has(p.id);
              return (
                <RosterRow
                  key={p.id}
                  player={p}
                  out={!!absence}
                  badge={
                    absence
                      ? `Fora ${absence.duration} ${absence.duration === 1 ? 'jogo' : 'jogos'}`
                      : managed
                        ? 'Carga'
                        : p.pos
                  }
                  badgeTone={absence ? 'danger' : 'info'}
                  meta={
                    absence
                      ? `${p.age}a · ${money(p.salary)} · ${absence.reason === 'injury' ? 'lesionado' : 'suspenso'}`
                      : `${p.age}a · ${money(p.salary)} · ${p.nextSalary !== undefined ? `estendido · ${p.contractYears} anos` : p.contractYears === 1 ? 'último ano' : `${p.contractYears} anos`}`
                  }
                  share={absence ? 0 : Math.min(1, mpg / MINUTES_IN_A_GAME)}
                  caption={mpg > 0 ? `${Math.round(mpg)} min` : '—'}
                  onPress={() => setViewing(p)}
                />
              );
            })}

            <Text style={{ fontSize: 10.5, lineHeight: 15, color: INK.faint, paddingHorizontal: 4, marginTop: 2 }}>
              Toque num jogador para ver a ficha completa — estatísticas, carreira, atributos e contrato — ou dispensá-lo.
            </Text>
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
