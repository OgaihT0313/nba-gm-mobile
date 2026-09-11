import React from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';

import type { Decision, DecisionOption, Player } from '../types';
import { getPlayerImageUrl } from '../constants';
import { personalityOf } from '../services/personalityService';
import { COLORS, INK, RADIUS, withAlpha } from '../src/theme/tokens';
import { MonoLabel, HeroTitle, Stat } from './ui/kit';

// The decision queue's one screen. A takeover Modal rather than a pushed
// screen, for the same reason FiredOverlay is one: this is an INTERRUPTION.
// Keeping the season screen visible behind it is what gives the choice weight —
// your record is right there while you decide.
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

const TONE: Record<string, string> = {
  good: COLORS.goodSoft, warn: COLORS.warn, info: COLORS.info, bad: COLORS.badSoft, neutral: COLORS.textDim,
};

const OptionRow: React.FC<{ option: DecisionOption; onPress: () => void }> = ({ option, onPress }) => {
  const off = !!option.disabled;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      className={off ? '' : 'active:opacity-75'}
      style={{
        borderRadius: RADIUS.control,
        borderWidth: 1,
        borderColor: off ? COLORS.line : withAlpha(COLORS.cta, 0.45),
        backgroundColor: off ? COLORS.sunken : COLORS.panel,
        padding: 13,
        opacity: off ? 0.55 : 1,
      }}
    >
      <Text
        className="font-black"
        style={{ fontSize: 13.5, color: off ? COLORS.textDim : COLORS.text, textTransform: 'uppercase' }}
      >
        {option.label}
      </Text>
      <Text style={{ fontSize: 11.5, lineHeight: 16, color: INK.body, marginTop: 4 }}>
        {/* A disabled option always says WHY. A dead button with no explanation
            reads as a bug, and here it is usually information: "the market has
            nobody at that position" is worth knowing. */}
        {off ? (option.disabledReason ?? option.detail) : option.detail}
      </Text>
      {!off && option.consequence ? (
        <MonoLabel size={9} color={COLORS.warn} style={{ marginTop: 7, letterSpacing: 0.3 }}>
          {option.consequence}
        </MonoLabel>
      ) : null}
    </Pressable>
  );
};

const DecisionModal: React.FC<DecisionModalProps> = ({ decision, players, remaining, onChoose }) => {
  const subject = decision?.subjectId ? players[decision.subjectId] : undefined;

  return (
    <Modal visible={!!decision} animationType="fade" transparent statusBarTranslucent>
      {decision ? (
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(2,6,23,0.88)' }}>
          <View
            style={{
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: RADIUS.hero,
              borderTopRightRadius: RADIUS.hero,
              borderTopWidth: 1,
              borderColor: COLORS.line,
              maxHeight: '92%',
            }}
          >
            {/* The red edge marks this as the one thing standing between you and
                the next game — the same "one red thing per screen" rule the rest
                of the system follows. */}
            <View style={{ height: 3, backgroundColor: COLORS.cta, borderTopLeftRadius: RADIUS.hero, borderTopRightRadius: RADIUS.hero }} />

            <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 26 }} showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
                <MonoLabel size={9} color={COLORS.cta} style={{ letterSpacing: 1 }}>
                  Decisão do GM · dia {decision.day}
                </MonoLabel>
                {remaining > 0 ? (
                  <MonoLabel size={9} color={INK.faint}>
                    +{remaining} na fila
                  </MonoLabel>
                ) : null}
              </View>

              <View className="flex-row items-center" style={{ gap: 13 }}>
                {subject ? (
                  <Image
                    source={{ uri: getPlayerImageUrl(subject) }}
                    style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.sunken }}
                    contentFit="cover"
                  />
                ) : null}
                <View className="flex-1">
                  <HeroTitle size={20} numberOfLines={2} adjustsFontSizeToFit>
                    {decision.headline}
                  </HeroTitle>
                  {subject ? (
                    <View className="flex-row items-baseline flex-wrap" style={{ gap: 6, marginTop: 5 }}>
                      <Stat size={13}>{subject.ovr}</Stat>
                      <MonoLabel size={9} color={INK.meta}>
                        OVR · {subject.pos} · {subject.age} anos
                      </MonoLabel>
                      {/* Who he is, right where it changes the answer: the
                          options below are already written differently for him
                          (a star will not be bought off with minutes, a
                          workhorse shrugs off a rushed return), so the label
                          has to be visible at the moment of choosing. */}
                      <MonoLabel size={9} color={TONE[personalityOf(subject).tone]}>
                        · {personalityOf(subject).label}
                      </MonoLabel>
                    </View>
                  ) : null}
                </View>
              </View>

              <Text style={{ fontSize: 12.5, lineHeight: 19, color: COLORS.textSoft, marginTop: 14 }}>
                {decision.body}
              </Text>

              <View style={{ gap: 9, marginTop: 18 }}>
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
