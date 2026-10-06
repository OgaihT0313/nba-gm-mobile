import React from 'react';
import { View, Text, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT } from '../src/theme/tokens';
import { CtaButton, BodyText } from './ui/kit';

// Design 5e ("Transmissão"). A red stroke, "VOCÊ FOI DEMITIDO" at 88px, the
// owner's reason, the record of the tenure — and the way back in.

interface FiredOverlayProps {
  visible: boolean;
  note?: string;
  seasons: number;
  titles: number;
  onRestart: () => void;
}

const FiredOverlay: React.FC<FiredOverlayProps> = ({ visible, note, seasons, titles, onRestart }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: COLORS.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 22, gap: 22 }}>
          <View style={{ height: 6, width: 60, backgroundColor: COLORS.bad }} />
          <Text style={{ fontFamily: FONT.cond800, fontSize: 88, lineHeight: 74, color: COLORS.text, textTransform: 'uppercase' }} adjustsFontSizeToFit numberOfLines={2}>
            Você foi{'\n'}demitido
          </Text>
          {note ? <BodyText size={16}>{note}</BodyText> : null}
          <View style={{ borderTopWidth: 1, borderTopColor: COLORS.line }}>
            {[
              ['Temporadas no cargo', String(seasons)],
              ['Títulos', String(titles)],
            ].map(([k, v], i) => (
              <View key={k} className="flex-row justify-between" style={{ paddingVertical: 12, borderBottomWidth: i === 0 ? 1 : 0, borderBottomColor: COLORS.line }}>
                <Text style={{ fontFamily: FONT.body500, fontSize: 15, color: COLORS.muted }}>{k}</Text>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 16, color: COLORS.text }}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 22 }}>
          <CtaButton label="Procurar outro time" onPress={onRestart} size={20} />
        </View>
      </View>
    </Modal>
  );
};

export default FiredOverlay;
