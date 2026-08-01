import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { Player } from '../../types';
import { attributeColor, getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG } from '../../constants';
import { COLORS, INK, RADIUS, withAlpha } from '../../src/theme/tokens';
import { Panel, MonoLabel, Stat, Meter } from './kit';

// The roster line from design 2a, and the single most repeated object in the
// app — My Team, Free Agency, the trade baskets and the draft board all show
// "a player, and the one number that matters about him right now".
//
// The 3px edge bar is always the OVR color from constants.attributeColor, so
// scanning a roster top to bottom reads as a gradient of quality without having
// to parse a single digit.

export interface RosterRowProps {
  player: Player;
  /** Secondary line — "27a · $38.4M · 3 anos" by default. */
  meta?: string;
  /** 0..1 share bar under the meta line (minutes, interest, cap fit…). */
  share?: number;
  shareColor?: string;
  /** Small caption under the OVR, e.g. "36 MIN". */
  caption?: string;
  /** Pill next to the name — position by default, or an injury flag. */
  badge?: string;
  badgeTone?: 'info' | 'danger';
  /** Renders the row in the dimmed, red-tinted "unavailable" state. */
  out?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
  compact?: boolean;
}

const RosterRow: React.FC<RosterRowProps> = ({
  player, meta, share, shareColor, caption, badge, badgeTone = 'info', out, onPress, right, compact,
}) => {
  const ovrColor = attributeColor(player.ovr);
  const avatar = compact ? 34 : 42;

  const body = (
    <Panel
      bar={out ? COLORS.cta : ovrColor}
      padding={compact ? 11 : 12}
      fill={out ? '#150e12' : COLORS.panel}
      style={out ? { borderColor: '#3a1f22' } : undefined}
    >
      <View className="flex-row items-center" style={{ gap: 11 }}>
        <Image
          source={{ uri: getPlayerImageUrl(player) }}
          placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
          style={{ width: avatar, height: avatar, borderRadius: RADIUS.pill, backgroundColor: COLORS.line, opacity: out ? 0.65 : 1 }}
          contentFit="cover"
          transition={120}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text
              className="font-extrabold"
              style={{ fontSize: compact ? 12.5 : 13.5, color: out ? 'rgba(255,255,255,0.75)' : '#fff', flexShrink: 1 }}
              numberOfLines={1}
            >
              {player.name}
            </Text>
            {badge ? (
              <View
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 5,
                  backgroundColor: badgeTone === 'danger' ? withAlpha(COLORS.cta, 0.18) : COLORS.line,
                }}
              >
                <MonoLabel size={8.5} color={badgeTone === 'danger' ? COLORS.badSoft : COLORS.info} style={{ letterSpacing: 0.4 }}>
                  {badge}
                </MonoLabel>
              </View>
            ) : null}
          </View>

          {meta ? (
            <MonoLabel size={10} color={INK.meta} style={{ marginTop: 3, letterSpacing: 0 }} numberOfLines={1}>
              {meta}
            </MonoLabel>
          ) : null}

          {share !== undefined ? (
            <Meter
              value={share}
              color={shareColor ?? (out ? COLORS.cta : ovrColor)}
              height={4}
              track={out ? '#2a1518' : COLORS.line}
              style={{ marginTop: 7 }}
            />
          ) : null}
        </View>

        {right ?? (
          <View className="items-end">
            <Stat size={compact ? 15 : 22} color={ovrColor} style={out ? { opacity: 0.55 } : undefined}>
              {player.ovr}
            </Stat>
            {caption ? (
              <MonoLabel size={8.5} color={INK.faint} style={{ marginTop: 2, letterSpacing: 0 }}>
                {caption}
              </MonoLabel>
            ) : null}
          </View>
        )}
      </View>
    </Panel>
  );

  return onPress ? (
    <Pressable onPress={onPress} className="active:opacity-80">
      {body}
    </Pressable>
  ) : (
    body
  );
};

export default RosterRow;
