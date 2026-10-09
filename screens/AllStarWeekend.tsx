import React from 'react';
import { View, Text } from 'react-native';

import { AllStarResult, Player, Team } from '../types';
import { COLORS, FONT } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { Panel, ScreenTitle, SectionLabel, BodyText, Name, TeamBadge } from '../components/ui/kit';
import { Image } from 'expo-image';
import { getPlayerImageUrl, PLAYER_PLACEHOLDER_SVG } from '../constants';
import { useDesktop } from '../components/desktop/useDesktop';
import { DPage, DTitle, Cols, Col } from '../components/desktop/kit';

// Design 4e ("Transmissão"). A split scoreboard — West red, East dark blue —
// the game MVP in a gold-inset card, both conferences' squads in columns, and
// the two contests as tiles. The sim records the winner, not a final score, so
// the board says who won instead of inventing points.

interface AllStarWeekendProps {
  allStar?: AllStarResult;
  players: { [key: string]: Player };
  teams: Team[];
  allStarGame: number;
  userTeamId?: string;
}

const EAST_BG = '#1C2A42';
const EAST_INK = '#C9D7EE';

const AllStarWeekend: React.FC<AllStarWeekendProps> = ({ allStar, players, teams, allStarGame, userTeamId }) => {
  const desktop = useDesktop();
  const teamOf = (id: string) => teams.find((t) => t.roster.includes(id));

  if (!allStar) {
    if (desktop) {
      return (
        <DPage>
          <DTitle eyebrow="Meio da temporada" title="All-Star Weekend" />
          <Panel style={{ marginTop: 22, maxWidth: 640 }}>
            <BodyText>O All-Star Weekend acontece no jogo {allStarGame} da temporada regular.</BodyText>
          </Panel>
        </DPage>
      );
    }
    return (
      <Screen heroHeight={100}>
        <ScreenTitle label="Meio da temporada" title="All-Star Weekend" />
        <Body top={0}>
          <Panel>
            <BodyText>O All-Star Weekend acontece no jogo {allStarGame} da temporada regular.</BodyText>
          </Panel>
        </Body>
      </Screen>
    );
  }

  const mvp = players[allStar.mvpId];
  const mvpTeam = mvp ? teamOf(mvp.id) : undefined;
  const westWon = allStar.winner === 'west';

  const Squad: React.FC<{ ids: string[]; label: string; color: string }> = ({ ids, label, color }) => (
    <View style={{ flex: 1, minWidth: 0 }}>
      <SectionLabel color={color}>{label}</SectionLabel>
      <View style={{ marginTop: 4 }}>
        {ids.map((id) => players[id]).filter(Boolean).map((p) => {
          const t = teamOf(p.id);
          return (
            <View key={p.id} className="flex-row items-center" style={{ height: desktop ? 44 : 34, gap: 6, borderBottomWidth: 1, borderBottomColor: COLORS.lineSoft }}>
              <Name size={desktop ? 16 : 14} style={{ flex: 1 }}>{p.name}</Name>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, color: t?.id === userTeamId ? COLORS.gold : COLORS.dim }}>{t?.id.toUpperCase() ?? ''}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  const Contest: React.FC<{ label: string; id: string }> = ({ label, id }) => {
    const p = players[id];
    const t = p ? teamOf(p.id) : undefined;
    return (
      <Panel padding={12} radius={14} className="flex-1" style={{ gap: 3 }}>
        <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.5, color: COLORS.muted }}>{label}</Text>
        <Name size={15} numberOfLines={2}>{p ? `${p.name}${t ? ` · ${t.id.toUpperCase()}` : ''}` : '—'}</Name>
      </Panel>
    );
  };

  // PC: the split board across the page, then both squads and a 360px column
  // with the MVP (with his photo) and the two contests.
  if (desktop) {
    return (
      <DPage>
        <DTitle eyebrow="Meio da temporada" title="All-Star Weekend" />
        <View style={{ marginTop: 22, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', backgroundColor: COLORS.surface, height: 150 }}>
          <View style={{ flex: 1, backgroundColor: COLORS.west, paddingHorizontal: 28, justifyContent: 'center', gap: 4 }}>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 2, color: 'rgba(255,255,255,0.85)' }}>OESTE</Text>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 64, lineHeight: 62, color: westWon ? '#fff' : 'rgba(255,255,255,0.45)' }}>{westWon ? 'VENCEU' : '—'}</Text>
          </View>
          <View style={{ justifyContent: 'center', paddingHorizontal: 24 }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 16, letterSpacing: 2.4, color: COLORS.dim }}>FINAL</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: EAST_BG, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 13, letterSpacing: 2, color: '#9DBDEB' }}>LESTE</Text>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 64, lineHeight: 62, color: !westWon ? EAST_INK : 'rgba(201,215,238,0.4)' }}>{!westWon ? 'VENCEU' : '—'}</Text>
          </View>
        </View>
        <Cols style={{ marginTop: 22 }}>
          <Col><Squad ids={allStar.westRoster} label="Oeste" color={COLORS.west} /></Col>
          <Col><Squad ids={allStar.eastRoster} label="Leste" color={COLORS.east} /></Col>
          <Col width={360}>
            {mvp ? (
              <Panel padding={0} bar={COLORS.gold}>
                <View style={{ height: 220, backgroundColor: COLORS.surface2, justifyContent: 'flex-end', overflow: 'hidden' }}>
                  <Image source={{ uri: getPlayerImageUrl(mvp) }} placeholder={{ uri: PLAYER_PLACEHOLDER_SVG }} style={{ width: '100%', height: 210 }} contentFit="cover" contentPosition="top" />
                </View>
                <View style={{ padding: 16, gap: 4 }}>
                  <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.gold }}>MVP DO JOGO</Text>
                  <Text numberOfLines={2} style={{ fontFamily: FONT.cond800, fontSize: 28, lineHeight: 28, color: COLORS.text, textTransform: 'uppercase' }}>{mvp.name}</Text>
                  <View className="flex-row items-center" style={{ gap: 8, marginTop: 4 }}>
                    {mvpTeam ? <TeamBadge teamId={mvpTeam.id} width={34} height={22} /> : null}
                    <BodyText size={13}>{mvp.pos} · {mvp.ovr} OVR{mvpTeam?.id === userTeamId ? ' · seu jogador' : ''}</BodyText>
                  </View>
                </View>
              </Panel>
            ) : null}
            <View className="flex-row" style={{ gap: 8 }}>
              <Contest label="TORNEIO DE 3" id={allStar.threePointWinnerId} />
              <Contest label="ENTERRADAS" id={allStar.dunkWinnerId} />
            </View>
          </Col>
        </Cols>
      </DPage>
    );
  }

  return (
    <Screen heroHeight={100}>
      <ScreenTitle label="Meio da temporada" title="All-Star Weekend" />

      <Body top={0} gap={14}>
        <View style={{ borderRadius: 20, overflow: 'hidden', flexDirection: 'row', backgroundColor: COLORS.surface }}>
          <View style={{ flex: 1, backgroundColor: COLORS.west, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, gap: 2 }}>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: 'rgba(255,255,255,0.85)' }}>OESTE</Text>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 34, lineHeight: 36, color: westWon ? '#fff' : 'rgba(255,255,255,0.45)' }}>{westWon ? 'VENCEU' : '—'}</Text>
          </View>
          <View style={{ justifyContent: 'center', paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 12, letterSpacing: 1.7, color: COLORS.dim }}>FINAL</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: EAST_BG, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: '#9DBDEB' }}>LESTE</Text>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 34, lineHeight: 36, color: !westWon ? EAST_INK : 'rgba(201,215,238,0.4)' }}>{!westWon ? 'VENCEU' : '—'}</Text>
          </View>
        </View>

        {mvp ? (
          <Panel bar={COLORS.gold} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: COLORS.gold }}>MVP DO JOGO</Text>
              <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 20, lineHeight: 21, color: COLORS.text, textTransform: 'uppercase' }}>{mvp.name}</Text>
              <BodyText size={12.5}>{mvp.pos} · {mvp.ovr} OVR{mvpTeam?.id === userTeamId ? ' · seu jogador' : ''}</BodyText>
            </View>
            {mvpTeam ? <TeamBadge teamId={mvpTeam.id} width={44} height={30} /> : null}
          </Panel>
        ) : null}

        <View className="flex-row" style={{ gap: 8 }}>
          <Squad ids={allStar.westRoster} label="Oeste" color={COLORS.west} />
          <Squad ids={allStar.eastRoster} label="Leste" color={COLORS.east} />
        </View>

        <View className="flex-row" style={{ gap: 8 }}>
          <Contest label="TORNEIO DE 3" id={allStar.threePointWinnerId} />
          <Contest label="ENTERRADAS" id={allStar.dunkWinnerId} />
        </View>
      </Body>
    </Screen>
  );
};

export default AllStarWeekend;
