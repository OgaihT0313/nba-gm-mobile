import React from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Decision, DecisionOption, DecisionKind, Player } from '../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG } from '../constants';
import { personalityOf } from '../services/personalityService';
import { COLORS, FONT, ovrColor } from '../src/theme/tokens';
import { useDesktop } from './desktop/useDesktop';

// Design 5d ("Transmissão"). The decision queue's one screen, as an
// INTERRUPTION: the season stays visible behind a dark veil — your record is
// right there while you decide — and the choice sits in a card at the foot.
//
// Nothing here reaches the events feed. That buffer holds 50 and renders 6, and
// an offseason pushes hundreds through it; a decision that mattered enough to
// stop the season cannot be announced somewhere it would be buried in two days.

interface DecisionModalProps {
  decision?: Decision;
  players: { [key: string]: Player };
  /** How many are still queued behind this one. */
  remaining: number;
  onChoose: (decisionId: string, optionId: string) => void;
}

const CATEGORY: Record<DecisionKind, string> = {
  injury_cover: 'Lesão',
  trade_request: 'Vestiário',
  deadline_stance: 'Prazo de trocas',
  contract_extension: 'Contrato',
  press_conference: 'Coletiva de imprensa',
};

const OptionRow: React.FC<{ option: DecisionOption; onPress: () => void }> = ({ option, onPress }) => {
  const off = !!option.disabled;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      aria-disabled={off}
      className={off ? '' : 'active:opacity-75'}
      style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.surface2, gap: 4, opacity: off ? 0.5 : 1 }}
    >
      <Text style={{ fontFamily: FONT.cond800, fontSize: 17, lineHeight: 18, color: off ? COLORS.dim : COLORS.text, textTransform: 'uppercase' }}>
        {option.label}
      </Text>
      {/* A disabled option always says WHY. A dead button with no explanation
          reads as a bug, and here it is usually information. */}
      <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, lineHeight: 17, color: COLORS.muted }}>
        {off ? (option.disabledReason ?? option.detail) : option.detail}
      </Text>
      {!off && option.consequence ? (
        <Text style={{ fontFamily: FONT.body600, fontSize: 12.5, lineHeight: 17, color: COLORS.warn }}>{option.consequence}</Text>
      ) : null}
    </Pressable>
  );
};

const DecisionModal: React.FC<DecisionModalProps> = ({ decision, players, remaining, onChoose }) => {
  const insets = useSafeAreaInsets();
  // PC: a 640px card centered over the season instead of pinned to the foot.
  const desktop = useDesktop();
  const subject = decision?.subjectId ? players[decision.subjectId] : undefined;

  return (
    <Modal visible={!!decision} animationType="fade" transparent statusBarTranslucent>
      {decision ? (
        <View className="flex-1" style={{ justifyContent: desktop ? 'center' : 'flex-end', alignItems: desktop ? 'center' : 'stretch', backgroundColor: 'rgba(5,5,6,0.72)', paddingBottom: insets.bottom + (desktop ? 32 : 12), paddingTop: insets.top + (desktop ? 32 : 20) }}>
          <View style={{ marginHorizontal: 12, width: desktop ? 640 : undefined, maxWidth: '100%', maxHeight: '100%', backgroundColor: COLORS.surface, borderRadius: 24, borderWidth: 1, borderColor: '#2A2A2F', overflow: 'hidden' }}>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: desktop ? 24 : 16, paddingTop: desktop ? 24 : 18, paddingBottom: desktop ? 22 : 16, gap: 14 }} showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center justify-between">
                <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.warn, textTransform: 'uppercase' }}>
                  {CATEGORY[decision.kind] ?? 'Decisão'} · dia {decision.day}
                </Text>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.dim }}>
                  1 DE {remaining + 1}
                </Text>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: desktop ? 34 : 28, lineHeight: desktop ? 34 : 28, color: COLORS.text, textTransform: 'uppercase' }}>
                  {decision.headline}
                </Text>
                {subject ? (
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    <Image
                      source={{ uri: getPlayerImageUrl(subject) }}
                      placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
                      style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.surface2 }}
                      contentFit="cover"
                      contentPosition="top"
                    />
                    <Text style={{ fontFamily: FONT.cond800, fontSize: 20, color: ovrColor(subject.ovr) }}>{subject.ovr}</Text>
                    {/* Who he is, right where it changes the answer: the
                        options below are written differently for him. */}
                    <Text style={{ flex: 1, fontFamily: FONT.body500, fontSize: 12.5, color: COLORS.muted }} numberOfLines={1}>
                      {subject.pos} · {subject.age} anos · {personalityOf(subject).label}
                    </Text>
                  </View>
                ) : null}
                <Text style={{ fontFamily: FONT.body500, fontSize: 14, lineHeight: 20, color: COLORS.muted }}>{decision.body}</Text>
              </View>

              <View style={{ gap: 8 }}>
                {decision.options.map((o) => (
                  <OptionRow key={o.id} option={o} onPress={() => onChoose(decision.id, o.id)} />
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </Modal>
  );
};

export default DecisionModal;
