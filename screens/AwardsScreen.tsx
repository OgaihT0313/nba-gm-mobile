import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Svg, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

import { SeasonState, Player } from '../types';
import { getTeamAccent, getTeamLogoUrl, getTeamNickname } from '../constants';
import { COLORS, INK, RADIUS } from '../src/theme/tokens';
import Screen, { HeroContent, Body } from '../components/ui/Screen';
import { Panel, MonoLabel, Eyebrow, HeroTitle, Stat, CtaButton, SectionLabel } from '../components/ui/kit';
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

  const goldBackdrop = (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="champGlow" cx="50%" cy="0%" r="80%">
            <Stop offset="0" stopColor={COLORS.gold} stopOpacity={0.28} />
            <Stop offset="1" stopColor={COLORS.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#champGlow)" />
      </Svg>
    </View>
  );

  return (
    <Screen
      heroHeight={isChampionScreen ? 0 : 140}
      background={isChampionScreen ? COLORS.goldBg : COLORS.bg}
      backdrop={isChampionScreen ? goldBackdrop : undefined}
      footer={
        season.status === 'offseason' ? (
          <CtaButton
            label="Começar próxima temporada"
            sub="Progressão e draft"
            onPress={onStartNewSeason}
            gold={isChampionScreen}
          />
        ) : season.status === 'playoffs_idle' ? (
          <CtaButton label="Ir para os playoffs" onPress={onGoToPlayoffs} />
        ) : undefined
      }
    >
      {isChampionScreen ? (
        /* ------------------------------------------------------- champion */
        <HeroContent className="items-center">
          <Eyebrow color={COLORS.gold} size={9.5}>
            Temporada {seasonNumber} · campeão da NBA
          </Eyebrow>
          <Image
            source={{ uri: getTeamLogoUrl(champion) }}
            style={{ width: 104, height: 104, marginTop: 20 }}
            contentFit="contain"
          />
          <HeroTitle size={40} style={{ marginTop: 16, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
            {getTeamNickname(champion)}
          </HeroTitle>
          <MonoLabel size={11} color="rgba(255,255,255,0.6)" style={{ marginTop: 8, letterSpacing: 1.5 }}>
            {finalsScore ? `Venceu as finais por ${finalsScore}` : 'Campeão da NBA'}
          </MonoLabel>
        </HeroContent>
      ) : (
        <HeroContent>
          <Eyebrow>Prêmios · temporada {seasonNumber}</Eyebrow>
          <HeroTitle size={28} style={{ marginTop: 9 }}>Honrarias</HeroTitle>
        </HeroContent>
      )}

      <Body top={isChampionScreen ? 26 : 18}>
        {/* Finals MVP leads on the champion screen — the hero-radius card. */}
        {isChampionScreen && playoffAwards?.finalsMVP ? (
          <FinalsAwardCard
            title="MVP das finais"
            pId={playoffAwards.finalsMVP}
            players={season.players}
            accentColor={COLORS.gold}
          />
        ) : null}

        {/* The regular-season honors, as a three-up strip on the champion
            screen and as full cards otherwise. */}
        {season.awards ? (
          isChampionScreen ? (
            <>
              <View className="flex-row" style={{ gap: 9 }}>
                <GoldTile label="MVP da liga" id={season.awards.mvp} season={season} />
                <GoldTile label="Defensor" id={season.awards.dpoy} season={season} />
                <GoldTile label="Calouro" id={season.awards.roy} season={season} />
              </View>
              <View className="flex-row" style={{ gap: 9 }}>
                <GoldTile label="6º homem" id={season.awards.smoy} season={season} />
                {season.awards.mip ? <GoldTile label="Evolução" id={season.awards.mip} season={season} /> : <View style={{ flex: 1 }} />}
                <View style={{ flex: 1 }} />
              </View>
            </>
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
          <Panel
            fill={COLORS.goldPanel}
            padding={14}
            style={{ borderColor: COLORS.goldLine }}
          >
            <MonoLabel color={INK.meta}>Seu legado como GM</MonoLabel>
            <View className="flex-row items-end" style={{ gap: 22, marginTop: 12 }}>
              <View>
                <Stat size={30}>{season.gmLegacy.seasons}</Stat>
                <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 3, letterSpacing: 0 }}>Temporadas</MonoLabel>
              </View>
              <View>
                <Stat size={30} color={COLORS.gold}>{season.gmLegacy.titles}</Stat>
                <MonoLabel size={9.5} color={INK.meta} style={{ marginTop: 3, letterSpacing: 0 }}>Títulos</MonoLabel>
              </View>
              <Text style={{ flex: 1, textAlign: 'right', fontSize: 10.5, lineHeight: 15, color: INK.body }}>
                {season.owner.note ? `“${season.owner.note}”` : userWon ? '“Entregou o que prometeu.”' : ''}
              </Text>
            </View>
          </Panel>
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
          <Panel padding={14} fill={isChampionScreen ? COLORS.goldPanel : COLORS.panel} style={isChampionScreen ? { borderColor: COLORS.goldLine } : undefined}>
            <MonoLabel>Offseason</MonoLabel>
            <Text style={{ fontSize: 11.5, lineHeight: 17, color: INK.body, marginTop: 8 }}>
              Começar a próxima temporada roda a progressão dos jogadores, aplica as movimentações reais da NBA,
              expira contratos e abre o Draft de Recrutas.
            </Text>
          </Panel>
        ) : null}
      </Body>
    </Screen>
  );
};

/** Compact honor tile in the champion screen's gold register. */
const GoldTile: React.FC<{ label: string; id?: string; season: SeasonState }> = ({ label, id, season }) => {
  const p: Player | undefined = id ? season.players[id] : undefined;
  const team = id ? season.teams.find((t) => t.roster.includes(id)) : undefined;
  const mine = team?.id === season.userTeamId;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.goldPanel,
        borderWidth: 1,
        borderColor: COLORS.goldLine,
        borderRadius: RADIUS.card,
        paddingHorizontal: 12,
        paddingVertical: 12,
      }}
    >
      <MonoLabel size={8} color={INK.meta} numberOfLines={1}>{label}</MonoLabel>
      <Text className="font-extrabold text-white" style={{ fontSize: 12.5, marginTop: 5 }} numberOfLines={1}>
        {p ? `${p.name.split(' ')[0][0]}. ${p.name.split(' ').slice(-1)[0]}` : '—'}
      </Text>
      <MonoLabel
        size={9.5}
        color={mine ? COLORS.gold : INK.faint}
        style={{ marginTop: 2, letterSpacing: 0 }}
        numberOfLines={1}
      >
        {team ? team.id.toUpperCase() : '—'}
      </MonoLabel>
    </View>
  );
};

export default AwardsScreen;
