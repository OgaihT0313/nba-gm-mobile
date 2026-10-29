import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Player } from '../types';
import { ATTRIBUTE_META, getPlayerAttributes, getPlayerPositions, tricodeOf } from '../constants';
import { COLORS, FONT, withAlpha } from '../src/theme/tokens';
import { BodyText, PlayerFace, SectionLabel } from './ui/kit';
import { useDesktop } from './desktop/useDesktop';
import { useLeague } from './LeagueContext';

// Two players side by side (ROADMAP Q7): opened from the player sheet with
// the first one fixed, the second picked here -- by name, or from the players
// nearest him in OVR at his position. Each line marks the better number.

const money = (value: number) => `$${(value / 1_000_000).toFixed(1)}M`;
const DIACRITICS = /[̀-ͯ]/g;
const normalize = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
const POT_RANK: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
const POT_LABEL: Record<string, string> = { A: 'Elite', B: 'Alto', C: 'Estável', D: 'Limitado' };
const SUGGESTIONS = 10;
const RESULTS = 20;

interface Line {
  label: string;
  a: string;
  b: string;
  /** Higher wins; null when neither side is "better" (age, salary). */
  va: number | null;
  vb: number | null;
}

const PlayerCompare: React.FC<{ player: Player; onClose: () => void }> = ({ player: a, onClose }) => {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const league = useLeague();
  const [otherId, setOtherId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const b = otherId ? league?.players[otherId] : undefined;

  const candidates = useMemo(() => {
    if (!league) return [];
    const q = normalize(query.trim());
    const pool = Object.values(league.players).filter((p) => p.id !== a.id && !p.prospect);
    if (q) {
      return pool
        .filter((p) => normalize(p.name).includes(q))
        .sort((x, y) => Number(!!x.retired) - Number(!!y.retired) || y.ovr - x.ovr)
        .slice(0, RESULTS);
    }
    // Nothing typed: his peers -- same main position, nearest OVR.
    const pos = getPlayerPositions(a)[0];
    return pool
      .filter((p) => !p.retired && getPlayerPositions(p).includes(pos))
      .sort((x, y) => Math.abs(x.ovr - a.ovr) - Math.abs(y.ovr - a.ovr) || y.ovr - x.ovr)
      .slice(0, SUGGESTIONS);
  }, [league, query, a]);

  const teamLabel = (p: Player) => {
    if (p.retired) return 'Aposentado';
    const t = league?.teamOf(p.id);
    return t ? tricodeOf(t) : 'Sem time';
  };

  const lines = (x: Player, y: Player): { title: string; rows: Line[] }[] => {
    const ax = getPlayerAttributes(x);
    const ay = getPlayerAttributes(y);
    const sx = x.seasonStats && x.seasonStats.gp > 0 ? x.seasonStats : undefined;
    const sy = y.seasonStats && y.seasonStats.gp > 0 ? y.seasonStats : undefined;
    const num = (v: number) => ({ s: String(v), v });
    const row = (label: string, p: { s: string; v: number | null }, q: { s: string; v: number | null }): Line =>
      ({ label, a: p.s, b: q.s, va: p.v, vb: q.v });
    const stat = (s: typeof sx, k: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'mpg') =>
      s ? { s: s[k].toFixed(1), v: s[k] } : { s: '—', v: null };
    const groups = [
      {
        title: 'Geral',
        rows: [
          row('OVR', num(x.ovr), num(y.ovr)),
          row('Potencial', { s: POT_LABEL[x.potential] ?? x.potential, v: POT_RANK[x.potential] ?? null }, { s: POT_LABEL[y.potential] ?? y.potential, v: POT_RANK[y.potential] ?? null }),
          row('Ataque', num(x.off), num(y.off)),
          row('Defesa', num(x.def), num(y.def)),
          row('Idade', { s: String(x.age), v: null }, { s: String(y.age), v: null }),
        ],
      },
      { title: 'Atributos', rows: ATTRIBUTE_META.map(({ key, label }) => row(label, num(ax[key]), num(ay[key]))) },
    ];
    if (sx || sy) {
      groups.push({
        title: 'Temporada',
        rows: [
          row('Jogos', { s: String(sx?.gp ?? 0), v: null }, { s: String(sy?.gp ?? 0), v: null }),
          row('Minutos', stat(sx, 'mpg'), stat(sy, 'mpg')),
          row('Pontos', stat(sx, 'ppg'), stat(sy, 'ppg')),
          row('Rebotes', stat(sx, 'rpg'), stat(sy, 'rpg')),
          row('Assistências', stat(sx, 'apg'), stat(sy, 'apg')),
          row('Roubos', stat(sx, 'spg'), stat(sy, 'spg')),
          row('Tocos', stat(sx, 'bpg'), stat(sy, 'bpg')),
        ],
      });
    }
    const deal = (p: Player) => (p.retired ? '—' : money(p.salary));
    const years = (p: Player) => (p.retired ? '—' : p.contractYears === 1 ? 'último' : `${p.contractYears} anos`);
    groups.push({
      title: 'Contrato',
      rows: [
        row('Salário', { s: deal(x), v: null }, { s: deal(y), v: null }),
        row('Duração', { s: years(x), v: null }, { s: years(y), v: null }),
      ],
    });
    return groups;
  };

  const side = (p: Player, align: 'left' | 'right') => (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === 'left' ? 'flex-start' : 'flex-end', gap: 6 }}>
      <PlayerFace player={p} teamId={league?.teamOf(p.id)} size={desktop ? 76 : 60} />
      <Text numberOfLines={2} style={{ fontFamily: FONT.cond800, fontSize: desktop ? 20 : 17, lineHeight: desktop ? 21 : 18, color: COLORS.text, textTransform: 'uppercase', textAlign: align }}>
        {p.name}
      </Text>
      <Text style={{ fontFamily: FONT.cond700, fontSize: 11.5, letterSpacing: 1.2, color: COLORS.muted }}>
        {p.pos} · {p.age} ANOS · {teamLabel(p).toUpperCase()}
      </Text>
    </View>
  );

  const picker = (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center" style={{ backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Comparar com…"
          placeholderTextColor={COLORS.faint}
          autoCorrect={false}
          autoCapitalize="none"
          style={{ flex: 1, fontFamily: FONT.body500, fontSize: 15, color: COLORS.text, paddingVertical: 10, outlineStyle: 'none' } as object}
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setQuery('')} hitSlop={8}>
            <Text style={{ color: COLORS.dim, fontSize: 18 }}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <SectionLabel>{query.trim() ? 'Resultados' : `Perto dele · ${getPlayerPositions(a)[0]}`}</SectionLabel>
      {candidates.length === 0 ? <BodyText size={13} color={COLORS.dim}>Ninguém com esse nome.</BodyText> : null}
      {candidates.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => { setOtherId(p.id); setQuery(''); }}
          className="flex-row items-center active:opacity-75"
          style={{ gap: 10, paddingVertical: 6 }}
        >
          <PlayerFace player={p} teamId={league?.teamOf(p.id)} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: FONT.body600, fontSize: 14.5, color: COLORS.text }}>{p.name}</Text>
            <Text style={{ fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.1, color: COLORS.muted }}>
              {p.pos} · {p.age} ANOS · {teamLabel(p).toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontFamily: FONT.cond800, fontSize: 20, color: COLORS.text }}>{p.ovr}</Text>
        </Pressable>
      ))}
    </View>
  );

  const table = b ? (
    <View style={{ gap: 14 }}>
      {lines(a, b).map((g) => (
        <View key={g.title} style={{ gap: 2 }}>
          <SectionLabel>{g.title}</SectionLabel>
          {g.rows.map((r) => {
            const winA = r.va !== null && r.vb !== null && r.va > r.vb;
            const winB = r.va !== null && r.vb !== null && r.vb > r.va;
            const cell = (text: string, win: boolean, align: 'left' | 'right') => (
              <View style={{ width: desktop ? 90 : 64, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
                <Text
                  style={{
                    fontFamily: FONT.cond800, fontSize: 17, color: win ? COLORS.good : COLORS.textSoft,
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
                    backgroundColor: win ? withAlpha(COLORS.good, 0.14) : 'transparent',
                  }}
                >
                  {text}
                </Text>
              </View>
            );
            return (
              <View key={r.label} className="flex-row items-center" style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                {cell(r.a, winA, 'left')}
                <Text style={{ flex: 1, textAlign: 'center', fontFamily: FONT.cond600, fontSize: 13.5, color: COLORS.muted }}>{r.label}</Text>
                {cell(r.b, winB, 'right')}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  ) : null;

  const body = (
    <>
      <View className="flex-row" style={{ gap: 12, paddingHorizontal: desktop ? 24 : 14, paddingTop: desktop ? 48 : 40, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
        {side(a, 'left')}
        <Text style={{ alignSelf: 'center', fontFamily: FONT.cond800, fontSize: 16, letterSpacing: 1.5, color: COLORS.dim }}>VS</Text>
        {b ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Trocar o segundo jogador" onPress={() => setOtherId(null)} style={{ flex: 1, minWidth: 0 }} className="active:opacity-75">
            {side(b, 'right')}
            <Text style={{ textAlign: 'right', fontFamily: FONT.cond700, fontSize: 11, letterSpacing: 1.2, color: COLORS.info, marginTop: 4 }}>TROCAR</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
            <BodyText size={13} color={COLORS.dim} style={{ textAlign: 'right' }}>Escolha com quem comparar.</BodyText>
          </View>
        )}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: desktop ? 24 : 14, paddingBottom: 18 + (desktop ? 0 : insets.bottom) }} keyboardShouldPersistTaps="handled">
        {b ? table : picker}
      </ScrollView>
    </>
  );

  const close = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Fechar comparação"
      onPress={onClose}
      hitSlop={10}
      style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 16, backgroundColor: COLORS.surface2, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
    >
      <Text style={{ color: COLORS.textSoft, fontSize: 18, lineHeight: 20 }}>×</Text>
    </Pressable>
  );

  if (desktop) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: 'rgba(5,5,6,0.72)' }}>
          <Pressable accessible={false} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
          <View style={{ width: 640, maxWidth: '100%', height: 720, maxHeight: '100%', backgroundColor: COLORS.bg, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.line }}>
            {body}
            {close}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(5,5,6,0.72)' }}>
        <Pressable accessible={false} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
        <View style={{ height: '90%', backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
          <View className="self-center" style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A40', marginVertical: 8 }} />
          {body}
          {close}
        </View>
      </View>
    </Modal>
  );
};

export default PlayerCompare;
