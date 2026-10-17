import React from 'react';
import { View, Image as RNImage, StyleSheet, type StyleProp, type ImageStyle, type ViewStyle } from 'react-native';
import { Image, type ImageContentFit, type ImageContentPosition } from 'expo-image';
import type { Player } from '../../types';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG } from '../../constants';

// Every player headshot in the app goes through here.
//
// In an era save, a player whose career went on past 2015 has no official
// photo of his own time: the closest one is years later, sometimes in another
// uniform (PLANO-FOTOS-ERAS.md; the era data marks him `photoOffEra`). His face
// gets an era treatment instead of passing for a photo of that season -- faded
// to sepia, film grain, and a cream border like an old card. Everyone else is
// drawn exactly as before.

const GRAIN = require('../../assets/photo-grain.png');
// Below this the border would eat the face; the tint and grain stay.
const FRAME_MIN = 44;

interface Props {
  player?: Player;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  contentPosition?: ImageContentPosition;
  /** Fade-in on load, ms (expo-image). */
  transition?: number;
}

export const PlayerPhoto: React.FC<Props> = ({ player, style, contentFit = 'cover', contentPosition, transition }) => {
  const photo = (
    <Image
      source={{ uri: getPlayerImageUrl(player) }}
      placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }}
      style={player?.photoOffEra ? { width: '100%', height: '100%' } : style}
      contentFit={contentFit}
      contentPosition={contentPosition}
      transition={transition}
    />
  );
  if (!player?.photoOffEra) return photo;

  const flat = (StyleSheet.flatten(style) ?? {}) as ImageStyle;
  const width = typeof flat.width === 'number' ? flat.width : undefined;
  const height = typeof flat.height === 'number' ? flat.height : undefined;
  const small = Math.min(width ?? Infinity, height ?? Infinity) < FRAME_MIN;
  const border = Math.max(2, Math.round(Math.min(width ?? 120, height ?? 120) * 0.04));
  return (
    <View style={[flat as ViewStyle, { overflow: 'hidden' }]}>
      {/* CSS filter on web, the platform filter on Android; iOS ignores it
          and keeps the tint, grain and border. */}
      <View style={{ flex: 1, filter: 'sepia(0.55) saturate(0.75) contrast(1.06)' }}>{photo}</View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(120, 82, 36, 0.14)', pointerEvents: 'none' }]} />
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <RNImage source={GRAIN} resizeMode="repeat" style={{ width: '100%', height: '100%', opacity: 0.22 }} />
      </View>
      {small ? null : (
        <View
          style={[StyleSheet.absoluteFill, { borderWidth: border, borderColor: '#efe4c8', borderRadius: flat.borderRadius, pointerEvents: 'none' }]}
        />
      )}
    </View>
  );
};

export default PlayerPhoto;
