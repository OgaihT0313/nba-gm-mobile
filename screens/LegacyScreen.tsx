import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { Player, SeasonState } from '../types';
import { getTeamNickname, teamsData } from '../constants';
import { COLORS, FONT } from '../src/theme/tokens';
import Screen, { Body } from '../components/ui/Screen';
import { Panel, ScreenTitle, SectionLabel, BodyText, FilterRow, TeamLogo, Tag, GhostButton, MonoLabel } from '../components/ui/kit';
import { useDesktop } from '../components/desktop/useDesktop';
import { DPage, DTitle, DTabs, Cols, Col } from '../components/desktop/kit';
import {
  RESULT_LABEL, evaluateAchievements, franchiseRecords, hallOfFame, hallOfFameScore, jerseyCandidates, leagueRecords,
} from '../services/historyService';

// Legado: the save's memory. Achievements, the season-by-season ledger, league
// and franchise records, and the Hall of Fame with the jerseys the user chose
// to retire. Everything here is derived from seasonHistory / awardHistory /
// player careers -- nothing is announced through the feed.

type Tab = 'achievements' | 'seasons' | 'records' | 'hall';
const TABS: { id: Tab; label: string }[] = [
  { id: 'achievements', label: 'Conquistas' },
  { id: 'seasons', label: 'Temporadas' },
  { id: 'records', label: 'Recordes' },
  { id: 'hall', label: 'Hall da Fama' },
];

interface Props {
  season: SeasonState;
  onRetireJersey: (playerId: string) => void;
}

const nick = (id?: string) => (id ? getTeamNickname(teamsData.find((t) => t.id === id)) : '—');

const LegacyScreen: React.FC<Props> = ({ season, onRetireJersey }) => {
  const desktop = useDesktop();
  const [tab, setTab] = useState<Tab>('achievements');
  const name = (id?: string) => (id && season.players[id]?.name) || '—';

  // "2026-27": season n of a live save starts in 2024+n; an era save counts
  // from its own starting year.
  const yearOf = (n: number) => {
    const base = season.era?.seasonLabel ? parseInt(season.era.seasonLabel.slice(0, 4), 10) : 2025;
    const start = base + n - 1;
    return `${start}-${String(start + 1).slice(2)}`;
  };

  const history = season.seasonHistory ?? [];
  const achievements = evaluateAchievements(season);
  const unlocked = achievements.filter((a) => a.unlocked).length;

  /* ---------------------------------------------------------------- tabs */

  const achievementList = (
    <View style={{ gap: 8 }}>
      <SectionLabel right={<MonoLabel>{unlocked}/{achievements.length}</MonoLabel>}>Conquistas do GM</SectionLabel>
      {/* Earned first, in earning order; the rest keep the list's order. */}
      {[...achievements].sort((x, y) => Number(y.unlocked) - Number(x.unlocked) || (x.season ?? 0) - (y.season ?? 0)).map((a) => (
        <Panel key={a.id} padding={13} bar={a.unlocked ? COLORS.gold : undefined}>
          <View className="flex-row items-center" style={{ gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: a.unlocked ? COLORS.gold : COLORS.textSoft, textTransform: 'uppercase' }}>{a.title}</Text>
              <BodyText>{a.description}</BodyText>
            </View>
            {a.unlocked
              ? <Tag color={COLORS.gold}>{a.season ? `T${a.season}` : 'Feito'}</Tag>
              : a.progress ? <Tag>{a.progress}</Tag> : null}
          </View>
        </Panel>
      ))}
    </View>
  );

  const seasonList = (
    <View style={{ gap: 8 }}>
      <SectionLabel>Temporada a temporada</SectionLabel>
      {history.length === 0 ? (
        <Panel><BodyText>O histórico começa quando a primeira temporada desta carreira terminar.</BodyText></Panel>
      ) : [...history].reverse().map((h) => {
        const champ = h.result === 'champion';
        const mvp = season.awardHistory.find((a) => a.season === h.season)?.mvp;
        return (
          <Panel key={h.season} padding={13} bar={champ ? COLORS.gold : undefined}>
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <View style={{ width: 62 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 16, color: COLORS.text }}>T{h.season}</Text>
                <Text style={{ fontFamily: FONT.body500, fontSize: 11.5, color: COLORS.dim }}>{yearOf(h.season)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 20, color: COLORS.text }}>
                  {h.wins}-{h.losses}
                  {h.seed ? <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: COLORS.muted }}>  {h.seed}º</Text> : null}
                </Text>
              </View>
              <Tag color={champ ? COLORS.gold : h.result === 'missed' ? COLORS.muted : COLORS.good} filled={champ}>{RESULT_LABEL[h.result]}</Tag>
            </View>
            <View className="flex-row items-center" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <TeamLogo teamId={h.championId} size={18} />
              <Text style={{ fontFamily: FONT.body600, fontSize: 13, color: COLORS.textSoft }}>
                {nick(h.championId)}{h.runnerUpId ? ` venceu ${nick(h.runnerUpId)}` : ' campeão'}
              </Text>
              {mvp ? <Text style={{ fontFamily: FONT.body500, fontSize: 13, color: COLORS.muted }}>· MVP {name(mvp)}</Text> : null}
            </View>
          </Panel>
        );
      })}
    </View>
  );

  const fr = franchiseRecords(season);
  const lr = leagueRecords(season);
  const row = (label: string, value: string, sub?: string, key?: string) => (
    <View key={key ?? label} className="flex-row items-center" style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.line, gap: 10 }}>
      <Text style={{ flex: 1, fontFamily: FONT.body500, fontSize: 13.5, color: COLORS.textSoft }} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>{sub}</Text> : null}
      <Text style={{ fontFamily: FONT.cond800, fontSize: 17, color: COLORS.text, minWidth: 54, textAlign: 'right' }}>{value}</Text>
    </View>
  );
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  const franchisePanel = (
    <View style={{ gap: 8 }}>
      <SectionLabel>{nick(season.userTeamId)} com você</SectionLabel>
      <Panel padding={13}>
        {fr.seasons === 0 ? <BodyText>Nenhuma temporada completa ainda.</BodyText> : (
          <View>
            {row('Campanha total', `${fr.wins}-${fr.losses}`)}
            {row('Títulos', String(fr.titles))}
            {row('Finais disputadas', String(fr.finals))}
            {row('Idas aos playoffs', `${fr.playoffs}/${fr.seasons}`)}
            {fr.best ? row('Melhor campanha', `${fr.best.wins}-${fr.best.losses}`, `T${fr.best.season}`) : null}
            {fr.worst && fr.worst !== fr.best ? row('Pior campanha', `${fr.worst.wins}-${fr.worst.losses}`, `T${fr.worst.season}`) : null}
          </View>
        )}
      </Panel>
    </View>
  );

  const singleSeasonPanel = (
    <View style={{ gap: 8 }}>
      <SectionLabel>Recordes de uma temporada</SectionLabel>
      <Panel padding={13}>
        {!lr.single.pts && !lr.bestTeam ? <BodyText>Aparecem depois da primeira temporada completa.</BodyText> : (
          <View>
            {lr.bestTeam ? row(`Campanha · ${nick(lr.bestTeam.teamId)}`, `${lr.bestTeam.wins}-${lr.bestTeam.losses}`, `T${lr.bestTeam.season}`) : null}
            {lr.single.pts ? row(`Pontos · ${name(lr.single.pts.playerId)}`, lr.single.pts.value.toFixed(1), `T${lr.single.pts.season}`) : null}
            {lr.single.reb ? row(`Rebotes · ${name(lr.single.reb.playerId)}`, lr.single.reb.value.toFixed(1), `T${lr.single.reb.season}`) : null}
            {lr.single.ast ? row(`Assistências · ${name(lr.single.ast.playerId)}`, lr.single.ast.value.toFixed(1), `T${lr.single.ast.season}`) : null}
          </View>
        )}
      </Panel>
    </View>
  );

  const careerPanel = (stat: 'pts' | 'reb' | 'ast', label: string) => (
    <View key={stat} style={{ gap: 8 }}>
      <SectionLabel>{label} na carreira</SectionLabel>
      <Panel padding={13}>
        {lr.career[stat].map((p, i) => row(
          `${i + 1}. ${p.name}`, fmt(p.career![stat]), p.retired ? 'aposentado' : undefined, p.id,
        ))}
      </Panel>
    </View>
  );

  const records = (
    <View style={{ gap: 16 }}>
      {franchisePanel}
      {singleSeasonPanel}
      {careerPanel('pts', 'Pontos')}
      {careerPanel('reb', 'Rebotes')}
      {careerPanel('ast', 'Assistências')}
    </View>
  );

  const hof = hallOfFame(season.players);
  const raised = (season.retiredJerseys ?? []).map((j) => ({ ...j, player: season.players[j.playerId] })).filter((j) => j.player);
  const candidates = jerseyCandidates(season);
  const honors = (p: Player) => {
    const c = p.career!;
    return [
      c.titles ? `${c.titles} título${c.titles > 1 ? 's' : ''}` : '',
      c.mvp ? `${c.mvp} MVP` : '',
      c.allNba ? `${c.allNba} All-NBA` : '',
      c.allStar ? `${c.allStar} All-Star` : '',
      `${fmt(c.pts)} pts`,
    ].filter(Boolean).join(' · ');
  };

  const hall = (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <SectionLabel>Camisas aposentadas · {nick(season.userTeamId)}</SectionLabel>
        {raised.length === 0 && candidates.length === 0 ? (
          <Panel><BodyText>Quando um jogador se aposentar vestindo a sua camisa, você decide aqui se ela sobe para o teto do ginásio.</BodyText></Panel>
        ) : null}
        {raised.map((j) => (
          <Panel key={j.playerId} padding={13} bar={COLORS.gold}>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 30, color: COLORS.gold, width: 44, textAlign: 'center' }}>{j.player.number}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text, textTransform: 'uppercase' }}>{j.player.name}</Text>
                <BodyText>Aposentada na T{j.season}</BodyText>
              </View>
            </View>
          </Panel>
        ))}
        {candidates.map((p) => (
          <Panel key={p.id} padding={13}>
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 30, color: COLORS.muted, width: 44, textAlign: 'center' }}>{p.number}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text, textTransform: 'uppercase' }}>{p.name}</Text>
                {p.career ? <BodyText>{honors(p)}</BodyText> : null}
              </View>
            </View>
            <GhostButton label={`Aposentar a camisa ${p.number}`} onPress={() => onRetireJersey(p.id)} style={{ marginTop: 10 }} />
          </Panel>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel right={<MonoLabel>{hof.length}</MonoLabel>}>Hall da Fama</SectionLabel>
        {hof.length === 0 ? (
          <Panel><BodyText>Entra quem se aposentar com uma carreira de títulos, prêmios e números à altura. Ninguém chegou lá ainda.</BodyText></Panel>
        ) : hof.map((p) => (
          <Panel key={p.id} padding={13} bar={COLORS.gold}>
            <View className="flex-row items-center" style={{ gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FONT.cond800, fontSize: 18, color: COLORS.text, textTransform: 'uppercase' }}>{p.name}</Text>
                <BodyText>{honors(p)}</BodyText>
              </View>
              <Tag color={COLORS.gold}>{Math.round(hallOfFameScore(p.career))}</Tag>
            </View>
          </Panel>
        ))}
      </View>
    </View>
  );

  const content = tab === 'achievements' ? achievementList : tab === 'seasons' ? seasonList : tab === 'records' ? records : hall;

  if (desktop) {
    return (
      <DPage>
        <DTitle eyebrow={`${unlocked} de ${achievements.length} conquistas`} title="Legado" />
        <DTabs items={TABS} value={tab} onChange={(id) => setTab(id as Tab)} style={{ marginTop: 18 }} />
        <View style={{ marginTop: 20, maxWidth: 900 }}>
          {tab === 'records' ? (
            <Cols>
              <Col gap={16}>{franchisePanel}{singleSeasonPanel}</Col>
              <Col gap={16}>{careerPanel('pts', 'Pontos')}{careerPanel('reb', 'Rebotes')}{careerPanel('ast', 'Assistências')}</Col>
            </Cols>
          ) : content}
        </View>
      </DPage>
    );
  }

  return (
    <Screen>
      <ScreenTitle label={`${unlocked} de ${achievements.length} conquistas`} title="Legado" />
      <Body top={0}>
        <FilterRow items={TABS} value={tab} onChange={(id) => setTab(id as Tab)} />
        {content}
      </Body>
    </Screen>
  );
};

export default LegacyScreen;
