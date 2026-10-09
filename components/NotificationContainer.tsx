import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Notification as NotificationType } from '../types';
import { COLORS, FONT } from '../src/theme/tokens';
import FadeInView from './FadeInView';
import { useDesktop } from './desktop/useDesktop';

// Toast overlay for the sim's events (injuries, trades, deadline, owner
// warnings). RN port: an absolutely-positioned stack near the top, above the
// screen content but below any Modal (RN Modals render in their own layer).
//
// The stack pads for the status bar itself. It used to sit under the app-level
// header, which the redesign removed so screen heroes could bleed to the top of
// the display — without this, a toast lands on top of the clock.
//
// "Transmissão" style: the same lower-third as the 3D HUD's play toast — a dark
// card, a colored inset stroke, a condensed caps kicker over the sentence.
const TONE: Record<string, string> = {
  trade: COLORS.east,
  error: COLORS.bad,
  info: COLORS.muted,
};

/** Messages arrive as "🔁 TRADE DEADLINE! Miami envia…": drop the emoji and lift
 *  the shouted lead-in into the kicker. Anything else is all body. */
function split(message: string): { kicker?: string; body: string } {
  const clean = message.replace(/^[^A-Za-z0-9À-ÿ]+/, '').trim();
  const m = clean.match(/^([A-Z0-9À-ÖØ-Þ '’.\-]{3,40}[!:])\s+([\s\S]+)$/);
  return m ? { kicker: m[1].replace(/[!:]$/, ''), body: m[2] } : { body: clean };
}

const NotificationContainer: React.FC<{ notifications: NotificationType[]; onRemove: (id: number) => void }> = ({ notifications, onRemove }) => {
  const insets = useSafeAreaInsets();
  // PC: a 380px stack in the top-right corner instead of a full-width band
  // over the page title.
  const desktop = useDesktop();
  if (notifications.length === 0) return null;
  return (
    <View style={{ pointerEvents: 'box-none', position: 'absolute', top: insets.top + (desktop ? 20 : 8), ...(desktop ? { right: 24, width: 380 } : { left: 12, right: 12 }), zIndex: 50, gap: 6 }}>
      {notifications.slice(-3).map((n) => {
        const color = TONE[n.type] || TONE.info;
        const { kicker, body } = split(n.message);
        return (
          <FadeInView key={n.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Toque para dispensar"
              onPress={() => onRemove(n.id)}
              className="active:opacity-80"
              style={{ backgroundColor: 'rgba(20,20,23,0.96)', borderRadius: 12, borderWidth: 1, borderColor: COLORS.lineStrong, paddingVertical: 9, paddingLeft: 15, paddingRight: 12, overflow: 'hidden', gap: 1 }}
            >
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: color }} />
              {kicker ? (
                <Text numberOfLines={1} style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.3, color, textTransform: 'uppercase' }}>{kicker}</Text>
              ) : null}
              <Text numberOfLines={3} style={{ fontFamily: FONT.body500, fontSize: 13, lineHeight: 18, color: COLORS.text }}>{body}</Text>
            </Pressable>
          </FadeInView>
        );
      })}
    </View>
  );
};

export default NotificationContainer;
