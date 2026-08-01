import React from 'react';
import { View, Text } from 'react-native';

import { AllStarResult, Player, Team } from '../types';
import { COLORS, INK } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, HeroTitle, SectionLabel } from '../components/ui/kit';
import { AwardCard } from '../components/AwardCards';
import RosterRow from '../components/ui/RosterRow';

interface AllStarWeekendProps {
  allStar?: AllStarResult;
  players: { [key: string]: Player };
  teams: Team[];
  allStarGame: number;
}

const AllStarWeekend: React.FC<AllStarWeekendProps> = ({ allStar, players, teams, allStarGame }) => {
  if (!allStar) {
    return (
      <Screen heroHeight={132}>
        <HeroContent>
          <Eyebrow>Meio da temporada</Eyebrow>
          <HeroTitle size={28} style={{ marginTop: 9 }}>All-Star Weekend</HeroTitle>
        </HeroContent>
        <Body top={16}>
          <Panel padding={16}>
            <MonoLabel>Ainda não</MonoLabel>
            <Text style={{ fontSize: 12, lineHeight: 18, color: INK.body, marginTop: 8 }}>
              O All-Star Weekend acontece no jogo {allStarGame} da temporada regular.
            </Text>
          </Panel>
        </Body>
      </Screen>
    );
  }

  const winnerLabel = allStar.winner === 'east' ? 'Leste' : 'Oeste';
  const winnerColor = allStar.winner === 'east' ? COLORS.info : COLORS.badSoft;

  const roster = (ids: string[]) =>
    ids
      .map((id) => players[id])
      .filter(Boolean)
      .map((p) => <RosterRow key={p.id} player={p} compact meta={`${p.age}a · ${p.pos}`} />);

  return (
    <Screen heroHeight={132}>
      <HeroContent>
        <Eyebrow>Meio da temporada</Eyebrow>
        <HeroTitle size={28} style={{ marginTop: 9 }}>All-Star Weekend</HeroTitle>
      </HeroContent>

      <Body top={16}>
        <Panel bar={winnerColor} padding={16}>
          <MonoLabel color={COLORS.gold}>All-Star Game</MonoLabel>
          <HeroTitle size={22} style={{ marginTop: 8 }}>Conferência {winnerLabel} venceu</HeroTitle>
        </Panel>

        <AwardCard title="MVP do All-Star Game" winnerId={allStar.mvpId} players={players} teams={teams} />
        <AwardCard title="Concurso de enterradas" winnerId={allStar.dunkWinnerId} players={players} teams={teams} />
        <AwardCard title="Concurso de 3 pontos" winnerId={allStar.threePointWinnerId} players={players} teams={teams} />

        <SectionLabel color={COLORS.info}>Conferência Leste</SectionLabel>
        {roster(allStar.eastRoster)}

        <SectionLabel color={COLORS.badSoft}>Conferência Oeste</SectionLabel>
        {roster(allStar.westRoster)}
      </Body>
    </Screen>
  );
};

export default AllStarWeekend;
