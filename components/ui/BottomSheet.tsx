import React from 'react';
import { View, Pressable, ScrollView, Modal, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT } from '../../src/theme/tokens';

// The one bottom sheet. Every list-in-a-sheet goes through here because the
// pattern everyone reaches for first is broken on Android: a sheet that is a
// Pressable nested inside the backdrop Pressable (stopPropagation to keep taps
// inside from closing it) takes every touch, so the ScrollView inside never
// gets the drag and the list cannot be scrolled. The backdrop here is a
// SIBLING of the sheet instead.

const BottomSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fraction of the screen the sheet may take. */
  maxHeight?: `${number}%`;
  children: React.ReactNode;
}> = ({ visible, onClose, title, maxHeight = '78%', children }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(5,5,6,0.72)' }}>
        <Pressable accessible={false} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
        <View
          style={{
            maxHeight, backgroundColor: COLORS.navBg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 + insets.bottom,
          }}
        >
          <View className="self-center" style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.lineStrong, marginBottom: 12 }} />
          {title ? (
            <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted, textTransform: 'uppercase', marginBottom: 10 }}>
              {title}
            </Text>
          ) : null}
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} showsVerticalScrollIndicator>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default BottomSheet;
