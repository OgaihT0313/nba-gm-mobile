import React from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Player } from '../types';
import { careerAverages } from '../services/careerService';
import { nextMilestone, MILESTONES } from '../services/milestoneService';
import { personalityOf } from '../services/personalityService';
import {
  getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG, formatPositionsFull, ATTRIBUTE_META, getPlayerAttributes, getTeamAccent,
} from '../constants';
import { COLORS, FONT, withAlpha, onAccent } from '../src/theme/tokens';
import { StatStrip, Tag, SectionLabel, BodyText } from './ui/kit';

// Design 5c ("Transmissão"). A bottom sheet: the header is a flat block in the
// player's team color (photo, "POS · # · AGE", name, OVR at 56px), then the
// season line as a stat strip, the attributes as colored bars, contract and
// morale tiles, the career, and the honors as tags.
//
// The backdrop is a SIBLING of the sheet, not its parent: a Pressable sheet
// nested in a Pressable backdrop took every touch on Android and the content
// could not be scrolled (see components/ui/BottomSheet.tsx).

const money = (value: number) => `$${(value / 1_000_000).toFixed(1)}M`;

const POTENTIAL_LABEL: { [key: string]: string } = {
  A: 'Elite', B: 'Alto', C: 'Estável', D: 'Limitado',
};

/** Attribute bar color by band. */
const attrColor = (v: number) => (v >= 85 ? COLORS.good : v >= 75 ? COLORS.text : v >= 68 ? COLORS.warn : COLORS.bad);

/** A button at the foot of the sheet, for whoever opened it (e.g. waive). */
export interface PlayerAction {
  label: string;
  onPress: () => void;
  tone?: 'danger' | 'neutral';
  disabled?: boolean;
  /** Why it is disabled, or what it costs. Always shown under the label. */
  sub?: string;
}

const PlayerDetailModal: React.FC<{
  player: Player;
  onClose: () => void;
  /** The team he plays for: colors the header. Neutral when absent. */
  teamId?: string;
  /** One line above the name, e.g. "Fora 6 jogos · lesionado". */
  status?: string;
  actions?: PlayerAction[];
}> = ({ player, onClose, teamId, status, actions }) => {
  const insets = useSafeAreaInsets();
  const attrs = getPlayerAttributes(player);
  const accent = teamId ? getTeamAccent(teamId) : { primary: COLORS.lineStrong, secondary: COLORS.ghostBorder };
  const ink = onAccent(accent.primary);
  const inkA = (a: number) => withAlpha(ink === '#ffffff' ? '#ffffff' : '#000000', a);
  const s = player.seasonStats;
  const per = personalityOf(player);
  const m = player.morale;
  const moraleLabel = typeof m !== 'number' ? '—' : m >= 65 ? 'Feliz' : m >= 35 ? 'Neutro' : m >= 20 ? 'Insatisfeito' : 'Quer sair';
  const moraleColor = typeof m !== 'number' ? COLORS.muted : m >= 65 ? COLORS.good : m >= 35 ? COLORS.warn : COLORS.bad;
  const c = player.career && player.career.seasons > 0 ? player.career : undefined;
  const next = nextMilestone(player);

  const honors: { text: string; gold: boolean }[] = [];
  if (c) {
    const add = (n: number, label: string, gold: boolean) => { if (n > 0) honors.push({ text: `${n > 1 ? `${n}× ` : ''}${label}`, gold }); };
    add(c.titles, 'Campeão', true);
    add(c.mvp, 'MVP', true);
    add(c.finalsMvp, 'MVP das Finais', true);
    add(c.dpoy, 'Defensor do ano', false);
    add(c.allStar, 'All-Star', false);
    add(c.allNba, 'All-NBA', false);
    add(c.roy, 'Calouro do ano', false);
    add(c.smoy, '6º homem', false);
    add(c.mip, 'Evolução', false);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(5,5,6,0.72)' }}>
        <Pressable accessible={false} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
        <View style={{ maxHeight: '94%', backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
          <View className="self-center" style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A40', marginVertical: 8 }} />

          {/* ------------------------------------------------ header block */}
          <View style={{ height: 170, flexDirection: 'row', backgroundColor: accent.primary }}>
            <View style={{ width: 130, justifyContent: 'flex-end', backgroundColor: inkA(0.08) }}>
              <Image source={{ uri: getPlayerImageUrl(player) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: 130, height: 150 }} contentFit="cover" contentPosition="top" />
            </View>
            <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
              <View style={{ gap: 3 }}>
                {status ? <Text style={{ fontFamily: FONT.cond800, fontSize: 12, letterSpacing: 1.2, color: ink === '#ffffff' ? '#FFD2D3' : '#7A0F12' }}>{status.toUpperCase()}</Text> : null}
                <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.9, color: inkA(0.85) }}>
                  {player.pos}{player.number ? ` · #${player.number}` : ''} · {player.age} ANOS
                </Text>
                <Text numberOfLines={2} style={{ fontFamily: FONT.cond800, fontSize: 28, lineHeight: 27, color: ink, textTransform: 'uppercase' }}>{player.name}</Text>
              </View>
              <View className="flex-row items-baseline" style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 56, lineHeight: 50, color: ink }}>{player.ovr}</Text>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.4, color: inkA(0.85) }}>
                  OVR · POT {POTENTIAL_LABEL[player.potential]?.toUpperCase() ?? player.potential}
                </Text>
              </View>
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: accent.secondary }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={onClose}
              hitSlop={10}
              style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 18, lineHeight: 20 }}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator>
            {/* ------------------------------------------- the season line */}
            <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 8 }}>
              <StatStrip
                size={21}
                items={s && s.gp > 0
                  ? [
                      { label: 'PTS', value: s.ppg.toFixed(1) },
                      { label: 'REB', value: s.rpg.toFixed(1) },
                      { label: 'AST', value: s.apg.toFixed(1) },
                      { label: 'ROU', value: s.spg.toFixed(1) },
                    ]
                  : [
                      { label: 'Ataque', value: player.off },
                      { label: 'Defesa', value: player.def },
                      { label: 'Idade', value: player.age },
                      { label: 'Jogos', value: c?.gp ?? 0 },
                    ]}
              />
            </View>

            <View style={{ padding: 14, gap: 16 }}>
              {s && s.gp > 0 ? (
                <BodyText size={12} color={COLORS.dim} style={{ marginTop: -6 }}>
                  Temporada · {s.gp} jogos · {s.mpg.toFixed(1)} min · {s.bpg.toFixed(1)} tocos · {s.tpg.toFixed(1)} erros
                </BodyText>
              ) : null}

              {/* ------------------------------------------- attributes */}
              <View style={{ gap: 8 }}>
                <SectionLabel>Atributos</SectionLabel>
                {ATTRIBUTE_META.map(({ key, label }) => {
                  const v = attrs[key];
                  const col = attrColor(v);
                  return (
                    <View key={key} className="flex-row items-center" style={{ gap: 10 }}>
                      <Text style={{ width: 104, fontFamily: FONT.cond600, fontSize: 14, color: COLORS.textSoft }}>{label}</Text>
                      <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: COLORS.line }}>
                        <View style={{ height: '100%', borderRadius: 3, backgroundColor: col, width: `${Math.max(4, ((v - 55) / 44) * 100)}%` }} />
                      </View>
                      <Text style={{ width: 30, textAlign: 'right', fontFamily: FONT.cond800, fontSize: 16, color: col }}>{v}</Text>
                    </View>
                  );
                })}
              </View>

              {/* ------------------------------------ contract and morale */}
              <View className="flex-row" style={{ gap: 8 }}>
                <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, gap: 3 }}>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.5, color: COLORS.muted }}>CONTRATO</Text>
                  <Text style={{ fontFamily: FONT.cond800, fontSize: 20, lineHeight: 21, color: COLORS.text }}>{money(player.salary)}</Text>
                  <BodyText size={12} color={COLORS.dim}>
                    {player.contractYears === 1 ? 'último ano' : `${player.contractYears} anos`}
                    {player.nextSalary !== undefined ? ` · estendido, depois ${money(player.nextSalary)}` : ''}
                  </BodyText>
                </View>
                <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, gap: 3 }}>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.5, color: COLORS.muted }}>MORAL</Text>
                  <Text style={{ fontFamily: FONT.cond800, fontSize: 20, lineHeight: 21, color: moraleColor }}>
                    {moraleLabel}{typeof m === 'number' ? ` · ${m}` : ''}
                  </Text>
                  <BodyText size={12} color={COLORS.dim}>{per.label} · {per.blurb}</BodyText>
                </View>
              </View>

              {player.draftInfo ? (
                <BodyText size={12.5} color={COLORS.dim}>
                  Draftado na {player.draftInfo.pick}ª escolha · projetado {player.draftInfo.projected} OVR
                </BodyText>
              ) : null}

              {/* ------------------------------------------------- career */}
              {c ? (
                <View style={{ gap: 8 }}>
                  <SectionLabel right={<Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.3, color: COLORS.dim }}>PICO {c.peakOvr} OVR</Text>}>
                    Carreira · {c.seasons} {c.seasons === 1 ? 'temporada' : 'temporadas'}
                  </SectionLabel>
                  <View style={{ backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 8 }}>
                    {(() => {
                      const avg = careerAverages(c);
                      return (
                        <StatStrip
                          size={19}
                          items={[
                            { label: 'PTS', value: avg.ppg.toFixed(1) },
                            { label: 'REB', value: avg.rpg.toFixed(1) },
                            { label: 'AST', value: avg.apg.toFixed(1) },
                            { label: 'Jogos', value: c.gp },
                          ]}
                        />
                      );
                    })()}
                  </View>
                  <BodyText size={12.5}>
                    {c.pts.toLocaleString('pt-BR')} pontos · {c.reb.toLocaleString('pt-BR')} rebotes · {c.ast.toLocaleString('pt-BR')} assistências
                  </BodyText>
                  {next ? (
                    <BodyText size={12.5} color={COLORS.east}>
                      Próximo marco: {next.mark.toLocaleString('pt-BR')} {MILESTONES[next.stat].label} · faltam {next.gap.toLocaleString('pt-BR')} (~{next.games} {next.games === 1 ? 'jogo' : 'jogos'})
                    </BodyText>
                  ) : null}
                </View>
              ) : null}

              {honors.length ? (
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                  {honors.map((h) => <Tag key={h.text} color={h.gold ? COLORS.gold : COLORS.textSoft}>{h.text}</Tag>)}
                </View>
              ) : null}

              <BodyText size={12} color={COLORS.dim}>{formatPositionsFull(player)}</BodyText>
            </View>
          </ScrollView>

          {actions && actions.length ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: COLORS.line, gap: 8, backgroundColor: COLORS.dockBg }}>
              {actions.map((a) => (
                <Pressable
                  key={a.label}
                  accessibilityRole="button"
                  aria-disabled={!!a.disabled}
                  onPress={a.disabled ? undefined : a.onPress}
                  className="active:opacity-75"
                  style={{
                    minHeight: 48, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, justifyContent: 'center',
                    borderWidth: 1, borderColor: a.tone === 'danger' && !a.disabled ? withAlpha(COLORS.bad, 0.55) : COLORS.ghostBorder,
                    opacity: a.disabled ? 0.55 : 1,
                  }}
                >
                  <Text style={{ fontFamily: FONT.cond800, fontSize: 15, letterSpacing: 1.1, color: a.tone === 'danger' && !a.disabled ? COLORS.bad : COLORS.textSoft, textTransform: 'uppercase' }}>
                    {a.label}
                  </Text>
                  {a.sub ? <BodyText size={12} color={COLORS.dim} style={{ marginTop: 1 }}>{a.sub}</BodyText> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

export default PlayerDetailModal;
