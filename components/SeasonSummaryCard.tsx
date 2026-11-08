// Q11: the season just finished as one image to keep or send -- record,
// result, the champion, the league leaders. On the phone it opens the share
// sheet (react-native-view-shot + expo-sharing); on the web, where a local file
// can't be shared, the PNG is downloaded.
import React, { useRef, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { SeasonState, SeasonRecord } from '../types';
import { getTeamAccent, tricodeOf } from '../constants';
import { RESULT_LABEL } from '../services/historyService';
import { COLORS, FONT } from '../src/theme/tokens';
import { Panel, GhostButton, SectionLabel } from './ui/kit';

const yy = (y: number) => String(y + 1).slice(-2);

const SeasonSummaryCard: React.FC<{ season: SeasonState; record: SeasonRecord }> = ({ season, record }) => {
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const team = season.teams.find((t) => t.id === record.userTeamId);
  const accent = getTeamAccent(record.userTeamId);
  // The season the record is about: the save's first plus the ones played.
  const firstYear = season.era ? parseInt(season.era.seasonLabel, 10) : 2025;
  const year = firstYear + record.season - 1;
  const champ = season.teams.find((t) => t.id === record.championId);
  const leader = (label: string, l?: { playerId: string; teamId?: string; value: number }) =>
    l ? { label, name: season.players[l.playerId]?.name ?? '', team: l.teamId ? tricodeOf(l.teamId) : '', value: l.value.toFixed(1) } : null;
  const leaders = [leader('Pontos', record.leaders.pts), leader('Rebotes', record.leaders.reb), leader('Assistências', record.leaders.ast)].filter(Boolean) as NonNullable<ReturnType<typeof leader>>[];

  const share = async () => {
    if (!ref.current || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const web = Platform.OS === 'web';
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: web ? 'data-uri' : 'tmpfile' });
      if (web) {
        const a = document.createElement('a');
        a.href = uri;
        a.download = `temporada-${year}-${yy(year)}.png`;
        a.click();
        setNote('Imagem baixada.');
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Resumo da temporada' });
      } else {
        setNote('Este aparelho não tem para onde compartilhar.');
      }
    } catch (e) {
      console.warn('[resumo] captura falhou', e);
      setNote('Não foi possível gerar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel padding={16} style={{ gap: 12 }}>
      <SectionLabel>Resumo da temporada</SectionLabel>
      {/* The image itself: fixed colors, so it looks the same in either mode. */}
      <View ref={ref} collapsable={false} style={{ backgroundColor: '#0B0B0D', borderRadius: 16, overflow: 'hidden' }}>
        <View style={{ height: 6, backgroundColor: accent.primary }} />
        <View style={{ padding: 20, gap: 14 }}>
          <View>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 2, color: '#9A988F', textTransform: 'uppercase' }}>
              {year}-{yy(year)} · Temporada {record.season}
            </Text>
            <Text style={{ fontFamily: FONT.cond800, fontSize: 30, lineHeight: 32, color: '#F3F1EC', textTransform: 'uppercase' }}>{team?.name ?? tricodeOf(record.userTeamId)}</Text>
          </View>
          <View className="flex-row items-end" style={{ gap: 18 }}>
            <View>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 52, lineHeight: 52, color: '#F3F1EC' }}>{record.wins}–{record.losses}</Text>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 12, letterSpacing: 1.5, color: '#9A988F', textTransform: 'uppercase' }}>
                {record.seed ? `${record.seed}º na conferência` : 'Campanha'}
              </Text>
            </View>
            <View style={{ paddingBottom: 6 }}>
              <Text style={{ fontFamily: FONT.cond800, fontSize: 24, color: record.result === 'champion' ? '#E8B64C' : '#F3F1EC' }}>
                {RESULT_LABEL[record.result]}
              </Text>
              <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: '#9A988F' }}>
                Campeão: {champ?.name ?? tricodeOf(record.championId)}
              </Text>
            </View>
          </View>
          {leaders.length ? (
            <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: '#26262B', paddingTop: 12 }}>
              <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.5, color: '#9A988F', textTransform: 'uppercase' }}>Líderes da liga</Text>
              {leaders.map((l) => (
                <View key={l.label} className="flex-row justify-between" style={{ gap: 8 }}>
                  <Text style={{ fontFamily: FONT.body500, fontSize: 13, color: '#C9C6C0' }}>{l.label}</Text>
                  <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontFamily: FONT.body600, fontSize: 13, color: '#F3F1EC' }}>
                    {l.name} {l.team ? `(${l.team})` : ''} · {l.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 2, color: '#5C5A55', textTransform: 'uppercase' }}>NBA Manager</Text>
        </View>
      </View>
      <GhostButton label={busy ? 'Gerando…' : Platform.OS === 'web' ? 'Baixar imagem' : 'Compartilhar imagem'} onPress={share} />
      {note ? <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>{note}</Text> : null}
    </Panel>
  );
};

export default SeasonSummaryCard;
