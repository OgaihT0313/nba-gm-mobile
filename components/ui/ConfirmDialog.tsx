import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { COLORS, FONT } from '../../src/theme/tokens';

export const dialogText = { fontFamily: FONT.body500, fontSize: 14, lineHeight: 20, color: COLORS.dim } as const;
export const dialogStrong = { fontFamily: FONT.body600, color: COLORS.text } as const;

// A yes/no over the screen. Colors inline, not by class: on the web a Modal
// renders outside the ThemeProvider's element, where the class colors (bg-panel,
// text-fg...) are CSS variables with no value -- the dialog came out see-through.
const ConfirmDialog: React.FC<{
  visible: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmColor: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ visible, title, onClose, onConfirm, confirmLabel, confirmColor, disabled, children }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable accessible={false} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 384, gap: 16, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel }}
      >
        <Text style={{ fontFamily: FONT.cond800, fontSize: 22, fontStyle: 'italic', textTransform: 'uppercase', color: COLORS.text }}>{title}</Text>
        {children}
        <View className="flex-row justify-end" style={{ gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}>
            <Text style={{ fontFamily: FONT.body600, fontSize: 14, color: COLORS.textSoft }}>Cancelar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            disabled={disabled}
            onPress={onConfirm}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: disabled ? COLORS.lineStrong : confirmColor }}
          >
            <Text style={{ fontFamily: FONT.cond800, fontSize: 15, textTransform: 'uppercase', color: '#FFFFFF' }}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>
);

export default ConfirmDialog;
