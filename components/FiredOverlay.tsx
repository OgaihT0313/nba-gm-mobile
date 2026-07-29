import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';

// RN port of the web's fired takeover. The owner let the GM go, so there's no
// continuing this franchise — the only way out is taking over another team
// (a fresh save). The web used a `fixed inset-0` div; here it's an RN Modal,
// which sidesteps the ancestor-transform containing-block trap entirely.
interface FiredOverlayProps {
  visible: boolean;
  note?: string;
  seasons: number;
  titles: number;
  onRestart: () => void;
}

const FiredOverlay: React.FC<FiredOverlayProps> = ({ visible, note, seasons, titles, onRestart }) => (
  <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
    <View className="flex-1 items-center justify-center px-6 bg-slate-950/95">
      <View className="w-full max-w-lg items-center gap-5">
        <Text className="text-[10px] font-black uppercase tracking-[3px] text-red-500">Diretoria</Text>
        <Text className="text-5xl font-display uppercase tracking-tighter text-white text-center leading-[52px]">
          Você foi{'\n'}demitido
        </Text>
        {note ? <Text className="text-slate-400 text-sm leading-5 text-center">{note}</Text> : null}

        <View className="flex-row justify-center gap-10 py-1">
          <View className="items-center">
            <Text className="text-3xl font-black text-white">{seasons}</Text>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Temporadas</Text>
          </View>
          <View className="items-center">
            <Text className="text-3xl font-black text-white">{titles}</Text>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Títulos</Text>
          </View>
        </View>

        <Pressable onPress={onRestart} className="px-8 py-4 rounded-card bg-white active:opacity-80">
          <Text className="text-slate-950 font-black uppercase tracking-wide">Assumir outro time</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

export default FiredOverlay;
