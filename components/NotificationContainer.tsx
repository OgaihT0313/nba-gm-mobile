import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Notification as NotificationType } from '../types';
import FadeInView from './FadeInView';

// Toast overlay for the sim's events (injuries, trades, deadline, owner
// warnings). RN port: an absolutely-positioned stack near the top, above the
// screen content but below any Modal (RN Modals render in their own layer).
//
// The stack pads for the status bar itself. It used to sit under the app-level
// header, which the redesign removed so screen heroes could bleed to the top of
// the display — without this, a toast lands on top of the clock.
const TONE: Record<string, { border: string; text: string }> = {
  trade: { border: 'border-sky-500/40', text: 'text-sky-300' },
  error: { border: 'border-red-500/40', text: 'text-red-300' },
  info: { border: 'border-line', text: 'text-slate-200' },
};

const NotificationContainer: React.FC<{ notifications: NotificationType[]; onRemove: (id: number) => void }> = ({ notifications, onRemove }) => {
  const insets = useSafeAreaInsets();
  if (notifications.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 50 }}>
      {notifications.slice(-3).map((n) => {
        const tone = TONE[n.type] || TONE.info;
        return (
          <FadeInView key={n.id}>
            <Pressable
              onPress={() => onRemove(n.id)}
              className={`bg-panel/95 border rounded-2xl px-4 py-3 mb-2 ${tone.border}`}
            >
              <Text className={`text-xs font-bold ${tone.text}`} numberOfLines={3}>{n.message}</Text>
            </Pressable>
          </FadeInView>
        );
      })}
    </View>
  );
};

export default NotificationContainer;
