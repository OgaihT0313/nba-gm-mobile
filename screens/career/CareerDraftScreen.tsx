// Minha Carreira, step 3: draft night. The picks come in one at a time, the
// way the broadcast reads them, until your name is called -- or the round
// ends without it.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

import { COLORS, FONT } from '../../src/theme/tokens';
import { getTeamAccent, getTeamNickname, getTeamTricode } from '../../constants';
import type { Team } from '../../types';
import type { CareerState } from '../../services/career/careerTypes';
import { TeamBadge } from '../../components/ui/kit';
import { Page, Label, Title, Body, Box, Cta } from './careerUi';

/** Seconds between picks on screen. */
const PICK_EVERY = 0.45;

const CareerDraftScreen: React.FC<{ career: CareerState; onStart: () => void }> = ({ career, onStart }) => {
  const picks = career.draftNight ?? [];
  const mine = picks.findIndex((p) => p.playerId === career.meId);
  const stopAt = mine >= 0 ? mine + 1 : picks.length;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= stopAt) return;
    // Slower as the call gets close, if it's coming.
    const near = mine >= 0 && mine - shown <= 2;
    const id = setTimeout(() => setShown((n) => n + 1), (near ? PICK_EVERY * 2.2 : PICK_EVERY) * 1000);
    return () => clearTimeout(id);
  }, [shown, stopAt, mine]);
  const done = shown >= stopAt;
  const team = (id: string) => career.league.teams.find((t) => t.id === id) as Team | undefined;
  const myTeam = career.draft?.teamId ? team(career.draft.teamId) : undefined;
  const accent = myTeam ? getTeamAccent(myTeam.id) : null;

  return (
    <Page dock={<Cta label={done ? 'Começar a carreira' : 'Pular para o fim'} sub={done ? `${career.draft?.label ?? ''} ›` : undefined} onPress={done ? onStart : () => setShown(stopAt)} tint={done && accent ? accent.primary : undefined} />}>
      <Label>Noite do draft · 1ª rodada</Label>
      <Title>{done ? (mine >= 0 ? 'Seu nome foi chamado' : 'Não foi dessa vez') : 'Com a escolha…'}</Title>
      {done ? (
        mine >= 0 && myTeam ? (
          <Box highlight={accent?.primary}>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <TeamBadge teamId={myTeam.id} width={52} height={52} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 24, color: COLORS.text, textTransform: 'uppercase' }}>{getTeamNickname(myTeam)}</Text>
                <Body>{career.draft?.label} · contrato de calouro de 3 anos</Body>
              </View>
            </View>
          </Box>
        ) : (
          <Box>
            <Body color={COLORS.text}>Trinta nomes chamados e nenhum foi o seu. Um time te oferece um contrato mínimo para disputar uma vaga no fim do banco.</Body>
          </Box>
        )
      ) : null}
      <View style={{ gap: 6 }}>
        {/* Newest on top: the pick being read is always on screen. */}
        {picks.slice(0, shown).reverse().map((p) => {
          const isMe = p.playerId === career.meId;
          const t = team(p.teamId);
          return (
            <View key={p.pick} className="flex-row items-center" style={{ gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: isMe ? COLORS.text : COLORS.surface }}>
              <Text style={{ width: 28, fontFamily: FONT.cond800, fontSize: 16, color: isMe ? COLORS.bg : COLORS.dim }}>{p.pick}</Text>
              {t ? <TeamBadge teamId={t.id} width={34} height={24} /> : <Text style={{ width: 34 }}>{getTeamTricode(t)}</Text>}
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.cond700, fontSize: 16, color: isMe ? COLORS.bg : COLORS.text }}>{p.name}</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 13, color: isMe ? COLORS.bg : COLORS.muted }}>{p.pos}</Text>
            </View>
          );
        })}
      </View>
    </Page>
  );
};

export default CareerDraftScreen;
