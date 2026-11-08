// Q9: the last roster move, with a way back until the next day is played
// (App.tsx keeps the save from before it).
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { COLORS, FONT } from '../src/theme/tokens';

const UndoBar: React.FC<{ label: string; onUndo: () => void; onDismiss: () => void; desktop?: boolean }> = ({ label, onUndo, onDismiss, desktop }) => (
  <View
    pointerEvents="box-none"
    style={desktop ? { position: 'absolute', right: 24, bottom: 24, width: 420 } : { position: 'absolute', left: 12, right: 12, bottom: 12 }}
  >
    <View
      className="flex-row items-center"
      style={{
        gap: 10, paddingVertical: 10, paddingLeft: 16, paddingRight: 8, borderRadius: 14,
        backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.lineStrong,
        shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.body600, fontSize: 13.5, color: COLORS.text }}>{label}</Text>
        <Text style={{ fontFamily: FONT.body500, fontSize: 11.5, color: COLORS.dim }}>Dá para desfazer até o próximo dia.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onUndo} className="active:opacity-70"
        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.ctaFill }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 14, color: COLORS.ctaInk, textTransform: 'uppercase' }}>Desfazer</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onDismiss} className="active:opacity-70" style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: COLORS.muted }}>×</Text>
      </Pressable>
    </View>
  </View>
);

export default UndoBar;
