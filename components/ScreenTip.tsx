// Q10: one short tip the first time each main screen opens, dismissed for good
// with "Entendi" (prefsService.seenTips). There was no tutorial at all, and an
// era save drops the user in a league whose rules he may not know.
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { COLORS, FONT } from '../src/theme/tokens';
import { hasSeenTip, markTipSeen } from '../services/prefsService';

export interface Tip { id: string; title: string; body: string }

/** The tip for this screen, if it has one. `eraSave`: the season replays real history. */
export const tipFor = (view: string, eraSave: boolean): Tip | null => {
  switch (view) {
    case 'simulation':
      return eraSave
        ? {
            id: 'era-save',
            title: 'Save de era',
            body: 'A liga segue a história real entre as temporadas: as transferências, o draft, as expansões, as aposentadorias e as voltas daquele verão. O que você faz no seu time vale; o resto da liga tenta seguir o roteiro. Os playoffs têm o formato da época.',
          }
        : {
            id: 'simulation',
            title: 'A temporada',
            body: 'Avance com +1 dia, +7 dias ou Simular temporada. A simulação para sozinha quando algo pede sua decisão, e o painel "Precisa da sua atenção" leva direto à tela certa.',
          };
    case 'my-team':
      return {
        id: 'my-team',
        title: 'Meu time',
        body: 'Elenco, rotação, staff e análise. Toque num titular na quadra para trocá-lo; "Melhor cinco" devolve a escalação ao automático. Na aba Staff ficam o técnico, os quatro profissionais e o orçamento deles.',
      };
    case 'trade':
      return {
        id: 'trade',
        title: 'Trocas',
        body: 'Monte uma oferta e veja na hora se o outro GM aceita. "O que eles aceitariam?" sugere um pacote, e marcar jogadores como negociáveis atrai propostas. As trocas fecham no prazo e reabrem na offseason.',
      };
    case 'draft':
      return {
        id: 'draft',
        title: 'Draft',
        body: 'A faixa de cada recruta é a leitura da liga. Os relatórios do seu olheiro estreitam a faixa e revelam o potencial; os recrutas mais nebulosos escondem os achados e as furadas.',
      };
    case 'free-agency':
      return {
        id: 'free-agency',
        title: 'Agência livre',
        body: 'Abaixo do teto você contrata à vontade. Acima dele, só com a exceção de nível médio, contratos mínimos ou a preferência pelos seus próprios jogadores (os que eram do seu time).',
      };
    case 'playoffs':
      return {
        id: 'playoffs',
        title: 'Playoffs',
        body: 'Simule rodada a rodada. Se uma série do seu time chegar ao jogo decisivo, ele é jogado na quadra 3D, com a tática de cada quarto nas suas mãos.',
      };
    case 'legacy':
      return {
        id: 'legacy',
        title: 'Legado',
        body: 'Conquistas, o histórico da franquia temporada a temporada e as camisas aposentadas: o que um save longo acumula.',
      };
    default:
      return null;
  }
};

const ScreenTip: React.FC<{ tip: Tip | null; desktop?: boolean }> = ({ tip, desktop }) => {
  // Read once per tip: the prefs file is small and read synchronously.
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  if (!tip || dismissed[tip.id] || hasSeenTip(tip.id)) return null;
  const close = () => {
    markTipSeen(tip.id);
    setDismissed((d) => ({ ...d, [tip.id]: true }));
  };
  return (
    <View
      pointerEvents="box-none"
      style={desktop
        ? { position: 'absolute', right: 24, bottom: 24, width: 380 }
        : { position: 'absolute', left: 12, right: 12, bottom: 12 }}
    >
      <View
        accessibilityRole="alert"
        style={{
          backgroundColor: COLORS.panel, borderRadius: 16, borderWidth: 1, borderColor: COLORS.lineStrong,
          padding: 16, gap: 8, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
        }}
      >
        <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.muted, textTransform: 'uppercase' }}>Dica</Text>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 19, color: COLORS.text }}>{tip.title}</Text>
        <Text style={{ fontFamily: FONT.body500, fontSize: 13, lineHeight: 19, color: COLORS.textSoft }}>{tip.body}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={close}
          className="active:opacity-70"
          style={{ alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.ctaFill, marginTop: 4 }}
        >
          <Text style={{ fontFamily: FONT.cond800, fontSize: 14, color: COLORS.ctaInk, textTransform: 'uppercase' }}>Entendi</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default ScreenTip;
