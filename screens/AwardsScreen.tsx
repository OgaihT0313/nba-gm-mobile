import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

import { SeasonState, Player } from '../types';
import { getTeamAccent, getTeamLogoUrl, getTeamNickname } from '../constants';
import { COLORS, INK, RADIUS, FONT } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { Panel, MonoLabel, CtaButton, SectionLabel, ScreenTitle, BodyText, Name, TeamBadge, Dock } from '../components/ui/kit';
import { AwardCard, FinalsAwardCard } from '../components/AwardCards';
import AllNbaTeams from '../components/AllNbaTeams';
import AwardHistory from '../components/AwardHistory';

// Design 3d — the one screen that deliberately breaks the system. When a
// champion exists, the page leaves #06080f for near-black #0a0803, the accent
// stops being the franchise color and becomes gold, the hero card jumps to the
// 32px radius, and even the CTA turns gold. That's the point: it happens once a
// season, and it should not look like a Tuesday.
//
// Before a champion is crowned the screen stays inside the system — same page,
// no gold, because there's nothing to celebrate yet.

interface AwardsScreenProps {
  season: SeasonState;
  onGoToPlayoffs: () => void;
  onStartNewSeason: () => void;
}

const AwardsScreen: React.FC<AwardsScreenProps> = ({ season, onGoToPlayoffs, onStartNewSeason }) => {
  const champion = season.playoff?.champion ?? null;
  const playoffAwards = season.playoff?.awards;
  const hasPlayoffAwards = !!(playoffAwards?.eastConfFinalsMVP || playoffAwards?.westConfFinalsMVP || playoffAwards?.finalsMVP);
  const isChampionScreen = !!champion;
  const userWon = champion?.id === season.userTeamId;
  const seasonNumber = season.gmLegacy.seasons || season.awardHistory.length || 1;

  // "4-2" from the user's side of the Finals, when the Finals resolved.
  const finalsScore = season.playoff?.finals?.s;

  // Finals line, read positionally ("m[0]wins-m[1]wins").
  const finals = season.playoff?.finals;
  const finalsLine = (() => {
    if (!finals || !champion || !finals.s) return 'Campeão da NBA';
    const idx = finals.m.findIndex((t) => t?.id === champion.id);
    const opp = finals.m[1 - idx];
    const [a0, a1] = finals.s.split('-').map(Number);
    const mine = idx === 0 ? a0 : a1;
    const theirs = idx === 0 ? a1 : a0;
    return `Venceram o ${getTeamNickname(opp ?? undefined)} por ${mine}–${theirs} nas Finais`;
  })();
  // The year the title was won: the end year of the season just played.
  const endYear = season.era?.seasonLabel
    ? parseInt(season.era.seasonLabel.slice(0, 4), 10) + 1
    : 2025 + seasonNumber;

  return (
    <Screen
      heroHeight={isChampionScreen ? 0 : 110}
      background={isChampionScreen ? COLORS.goldBg : COLORS.bg}
      footer={
        season.status === 'offseason' ? (
          <Dock style={isChampionScreen ? { backgroundColor: COLORS.goldBg, borderTopColor: COLORS.goldLine } : undefined}>
            <CtaButton label="Ir para a offseason" sub="Draft e mercado" onPress={onStartNewSeason} gold={isChampionScreen} />
          </Dock>
        ) : season.status === 'playoffs_idle' ? (
          <Dock><CtaButton label="Ir para os playoffs" onPress={onGoToPlayoffs} /></Dock>
        ) : undefined
      }
    >
      {isChampionScreen ? (
        /* ------------------------------------------------------- champion */
        <View style={{ marginHorizontal: 14, marginTop: 4, borderRadius: 24, backgroundColor: COLORS.gold, paddingHorizontal: 18, paddingVertical: 20, overflow: 'hidden', gap: 6 }}>
          <Text style={{ position: 'absolute', right: -10, bottom: -36, fontFamily: FONT.cond800, fontSize: 150, lineHeight: 150, color: 'rgba(26,20,5,0.09)' }}>
            {endYear}
          </Text>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 2.4, color: COLORS.goldInk }}>CAMPEÕES DA NBA</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontFamily: FONT.cond800, fontSize: 60, lineHeight: 54, color: COLORS.goldInk, textTransform: 'uppercase' }}>
            {getTeamNickname(champion)}
          </Text>
          <Text style={{ fontFamily: FONT.body600, fontSize: 15, color: COLORS.goldInk }}>{finalsLine}</Text>
          {userWon ? (
            <View style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: COLORS.goldInk, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 12, letterSpacing: 1.2, color: COLORS.gold }}>
                {season.gmLegacy.titles}º TÍTULO DA CARREIRA
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <ScreenTitle label={`Temporada ${seasonNumber}`} title="Prêmios" />
      )}

      <Body top={isChampionScreen ? 26 : 18}>
        {/* Finals MVP leads on the champion screen — the hero-radius card. */}

        {/* The regular-season honors, as a three-up strip on the champion
            screen and as full cards otherwise. */}
        {season.awards ? (
          isChampionScreen ? (
            <View>
              <SectionLabel color={COLORS.goldMeta}>Honrarias da temporada</SectionLabel>
              <View style={{ marginTop: 4 }}>
                <GoldRow label="MVP" id={season.awards.mvp} season={season} />
                {playoffAwards?.finalsMVP ? <GoldRow label="Finais" id={playoffAwards.finalsMVP} season={season} /> : null}
                <GoldRow label="Defensor" id={season.awards.dpoy} season={season} />
                <GoldRow label="Calouro" id={season.awards.roy} season={season} />
                <GoldRow label="6º homem" id={season.awards.smoy} season={season} />
                {season.awards.mip ? <GoldRow label="Evolução" id={season.awards.mip} season={season} /> : null}
              </View>
            </View>
          ) : (
            <>
              <SectionLabel>Temporada regular</SectionLabel>
              <AwardCard title="MVP" winnerId={season.awards.mvp} players={season.players} teams={season.teams} />
              <AwardCard title="Melhor defensor" winnerId={season.awards.dpoy} players={season.players} teams={season.teams} />
              <AwardCard title="Calouro do ano" winnerId={season.awards.roy} players={season.players} teams={season.teams} />
              <AwardCard title="Sexto homem" winnerId={season.awards.smoy} players={season.players} teams={season.teams} />
              {season.awards.mip ? (
                <AwardCard title="Maior evolução" winnerId={season.awards.mip} players={season.players} teams={season.teams} />
              ) : null}
            </>
          )
        ) : (
          <Panel padding={16}>
            <MonoLabel>Ainda não</MonoLabel>
            <Text style={{ fontSize: 12, lineHeight: 18, color: INK.body, marginTop: 8 }}>
              Os prêmios são anunciados quando a temporada regular termina.
            </Text>
          </Panel>
        )}

        {/* GM legacy — the one number that survives the season reset. */}
        {isChampionScreen ? (
          <View style={{ borderRadius: 16, backgroundColor: COLORS.goldPanel, paddingVertical: 12, flexDirection: 'row' }}>
            {[
              { v: season.gmLegacy.titles, l: 'Títulos', c: COLORS.gold },
              { v: season.gmLegacy.seasons, l: 'Temporadas', c: COLORS.text },
              { v: `${season.owner.confidence}%`, l: 'Confiança', c: COLORS.text },
            ].map((it, i) => (
              <View key={it.l} style={{ flex: 1, alignItems: 'center', gap: 1, borderLeftWidth: i ? 1 : 0, borderLeftColor: '#2A2414' }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 26, lineHeight: 26, color: it.c }}>{it.v}</Text>
                <Text style={{ fontFamily: FONT.cond700, fontSize: 10.5, letterSpacing: 1.5, color: COLORS.goldMeta, textTransform: 'uppercase' }}>{it.l}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {isChampionScreen && season.owner.note ? (
          <BodyText color={COLORS.goldMeta}>“{season.owner.note}”</BodyText>
        ) : null}

        {season.awards?.allNba && season.awards.allNba.length > 0 ? (
          <AllNbaTeams teams={season.awards.allNba} players={season.players} leagueTeams={season.teams} />
        ) : null}

        {hasPlayoffAwards && !isChampionScreen ? (
          <>
            <SectionLabel>Playoffs</SectionLabel>
            {playoffAwards!.eastConfFinalsMVP ? (
              <AwardCard title="MVP finais do Leste" winnerId={playoffAwards!.eastConfFinalsMVP} players={season.players} teams={season.teams} themed />
            ) : null}
            {playoffAwards!.westConfFinalsMVP ? (
              <AwardCard title="MVP finais do Oeste" winnerId={playoffAwards!.westConfFinalsMVP} players={season.players} teams={season.teams} themed />
            ) : null}
            {playoffAwards!.finalsMVP ? (
              <FinalsAwardCard
                title="MVP das finais"
                pId={playoffAwards!.finalsMVP}
                players={season.players}
                accentColor={getTeamAccent(season.playoff?.champion?.id).primary}
              />
            ) : null}
          </>
        ) : null}

        {season.awardHistory.length > 0 ? (
          <AwardHistory history={season.awardHistory} players={season.players} />
        ) : null}

        {season.status === 'offseason' ? (
          <BodyText size={12.5} color={isChampionScreen ? COLORS.goldMeta : COLORS.dim}>
            A offseason roda a evolução dos jogadores, as aposentadorias, os contratos que vencem e abre o Draft de Recrutas.
          </BodyText>
        ) : null}
      </Body>
    </Screen>
  );
};

/** One honor in the champion screen's gold register: label · name/line · team. */
const GoldRow: React.FC<{ label: string; id?: string; season: SeasonState }> = ({ label, id, season }) => {
  const p: Player | undefined = id ? season.players[id] : undefined;
  const team = id ? season.teams.find((t) => t.roster.includes(id)) : undefined;
  const st = p?.seasonStats;
  return (
    <View className="flex-row items-center" style={{ height: 52, gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.goldLine }}>
      <Text style={{ width: 72, fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.4, color: COLORS.gold, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Name size={16}>{p?.name ?? '—'}</Name>
        {st ? (
          <Text numberOfLines={1} style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.goldMeta }}>
            {st.ppg.toFixed(1)} pts · {st.rpg.toFixed(1)} reb · {st.apg.toFixed(1)} ast{team?.id === season.userTeamId ? ' · seu jogador' : ''}
          </Text>
        ) : null}
      </View>
      {team ? <TeamBadge teamId={team.id} width={34} height={20} /> : null}
    </View>
  );
};

export default AwardsScreen;
