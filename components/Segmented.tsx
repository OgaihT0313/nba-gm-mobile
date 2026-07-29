import React from 'react';
import { View, Text, Pressable } from 'react-native';

// RN port of the grouped sim-advance control. One unified pill container; the
// single `primary` segment carries the accent fill, the rest are calm ghosts.
// The web glow shadow is dropped (RN shadow limitations).
export interface SegmentedItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

interface SegmentedProps {
  items: SegmentedItem[];
}

const Segmented: React.FC<SegmentedProps> = ({ items }) => (
  <View className="flex-row gap-1 bg-slate-900 border border-slate-800 rounded-control p-1">
    {items.map((item, i) => (
      <Pressable
        key={i}
        onPress={item.disabled ? undefined : item.onClick}
        className={`flex-1 items-center py-2.5 rounded-lg ${item.primary ? 'bg-accent' : ''} ${item.disabled ? 'opacity-40' : ''}`}
      >
        <Text className={`text-xs font-black uppercase italic ${item.primary ? 'text-white' : 'text-slate-300'}`}>
          {item.label}
        </Text>
      </Pressable>
    ))}
  </View>
);

export default Segmented;
