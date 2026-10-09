import React from 'react';
import { View, Text, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT } from '../src/theme/tokens';
import { CtaButton, BodyText } from './ui/kit';
import { useDesktop } from './desktop/useDesktop';

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
  const desktop = useDesktop();
  const record = (
    <View style={{ borderTopWidth: 1, borderTopColor: COLORS.line }}>
      {[
        ['Temporadas no cargo', String(seasons)],
        ['Títulos', String(titles)],
      ].map(([k, v], i) => (
        <View key={k} className="flex-row justify-between" style={{ paddingVertical: desktop ? 16 : 12, borderBottomWidth: i === 0 ? 1 : 0, borderBottomColor: COLORS.line }}>
          <Text style={{ fontFamily: FONT.body500, fontSize: desktop ? 16 : 15, color: COLORS.muted }}>{k}</Text>
          <Text style={{ fontFamily: FONT.cond700, fontSize: desktop ? 22 : 16, color: COLORS.text }}>{v}</Text>
        </View>
      ))}
    </View>
  );

  // PC: the verdict huge on the left, the tenure and the way back on a 480px panel.
  if (desktop) {
    return (
      <Modal visible={visible} animationType="fade" transparent>
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: COLORS.bg }}>
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 96, gap: 28 }}>
            <View style={{ height: 8, width: 80, backgroundColor: COLORS.bad }} />
            <Text style={{ fontFamily: FONT.cond800, fontSize: 168, lineHeight: 140, color: COLORS.text, textTransform: 'uppercase' }}>
              Você foi{'\n'}demitido
            </Text>
            {note ? <BodyText size={20} style={{ maxWidth: 760 }}>{note}</BodyText> : null}
          </View>
          <View style={{ width: 480, backgroundColor: COLORS.navBg, borderLeftWidth: 1, borderLeftColor: COLORS.line, paddingHorizontal: 48, paddingVertical: 96, justifyContent: 'space-between' }}>
            {record}
            <CtaButton label="Procurar outro time" onPress={onRestart} size={21} style={{ minHeight: 58 }} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: COLORS.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 22, gap: 22 }}>
          <View style={{ height: 6, width: 60, backgroundColor: COLORS.bad }} />
          <Text style={{ fontFamily: FONT.cond800, fontSize: 88, lineHeight: 74, color: COLORS.text, textTransform: 'uppercase' }} adjustsFontSizeToFit numberOfLines={2}>
            Você foi{'\n'}demitido
          </Text>
          {note ? <BodyText size={16}>{note}</BodyText> : null}
          {record}
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 22 }}>
          <CtaButton label="Procurar outro time" onPress={onRestart} size={20} />
        </View>
      </View>
    </Modal>
  );
};

export default FiredOverlay;
