import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Team, StaffMember, StaffRole, SeasonState } from '../types';
import {
  STAFF_ROLES, ROLE_LABEL, staffBudget, staffPayroll, staffRoom, effectLine, isHiringOpen, NEUTRAL_RATING,
} from '../services/staffService';
import Icon from './Icon';
import { MonoLabel, Panel, CtaButton, GhostButton, BodyText, Meter } from './ui/kit';
import { COLORS, FONT, RADIUS, withAlpha } from '../src/theme/tokens';
import BottomSheet from './ui/BottomSheet';

const money = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

const ratingColor = (r: number) =>
  r >= 5 ? COLORS.good : r === 4 ? COLORS.goodSoft : r === NEUTRAL_RATING ? COLORS.muted : r === 2 ? COLORS.warn : COLORS.bad;

// Five pips, filled up to the rating: reads at a glance which roles are the
// strong ones without parsing numbers.
const Pips: React.FC<{ rating: number }> = ({ rating }) => (
  <View className="flex-row" style={{ gap: 3 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <View key={i} style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: i <= rating ? ratingColor(rating) : COLORS.lineStrong }} />
    ))}
  </View>
);

const MemberCard: React.FC<{
  member: StaffMember;
  action?: React.ReactNode;
}> = ({ member, action }) => (
  <View style={{ backgroundColor: COLORS.surface2, borderRadius: RADIUS.card, padding: 14, gap: 8 }}>
    <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 19, lineHeight: 20, color: COLORS.text }}>{member.name}</Text>
        <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim, marginTop: 3 }}>
          {member.age} anos · {member.interim ? 'interino até a entressafra' : `${member.years} ${member.years === 1 ? 'ano' : 'anos'} de contrato`} · {money(member.salary)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 18, lineHeight: 18, color: ratingColor(member.rating) }}>Nota {member.rating}</Text>
        <Pips rating={member.rating} />
      </View>
    </View>
    <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, color: COLORS.text }}>{effectLine(member.role, member.rating)}</Text>
    {action}
  </View>
);

interface StaffPanelProps {
  team: Team;
  status: SeasonState['status'];
  market?: SeasonState['staffMarket'];
  onHire: (member: StaffMember) => void;
  onFire: (role: StaffRole) => void;
}

const StaffPanel: React.FC<StaffPanelProps> = ({ team, status, market, onHire, onFire }) => {
  const [hiringRole, setHiringRole] = useState<StaffRole | null>(null);
  const [confirmFire, setConfirmFire] = useState<StaffRole | null>(null);
  const open = isHiringOpen(status);
  const budget = staffBudget(team);
  const used = staffPayroll(team);
  const room = staffRoom(team);
  const dead = team.staffDeadMoney ?? [];
  const firing = confirmFire ? team.staff?.[confirmFire] : undefined;

  return (
    <Panel padding={18} style={{ gap: 14 }}>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <Icon name="coach" size={16} color={COLORS.muted} />
        <MonoLabel>Staff</MonoLabel>
      </View>

      {/* The hard budget, the whole point of choosing. */}
      <View style={{ gap: 6 }}>
        <View className="flex-row items-end justify-between">
          <MonoLabel>Orçamento de staff</MonoLabel>
          <Text style={{ fontFamily: FONT.cond700, fontSize: 14, color: room < 0 ? COLORS.bad : COLORS.text }}>
            {money(used)} de {money(budget)}
          </Text>
        </View>
        <Meter value={used / budget} color={room < 0 ? COLORS.bad : used / budget > 0.9 ? COLORS.warn : COLORS.good} height={6} />
        <BodyText size={12} color={COLORS.dim}>
          {room >= 0 ? `${money(room)} livres.` : `${money(-room)} acima do limite.`} O orçamento é separado do teto de jogadores e não pode ser estourado numa contratação.
          {dead.length ? ` Dinheiro morto: ${dead.map((d) => `${d.name} ${money(d.amount)}/ano por mais ${d.years}`).join('; ')}.` : ''}
        </BodyText>
      </View>

      {STAFF_ROLES.map((role) => {
        const m = team.staff?.[role];
        const candidates = market?.[role] ?? [];
        return (
          <View key={role} style={{ gap: 8 }}>
            <MonoLabel color={COLORS.muted}>{ROLE_LABEL[role]}</MonoLabel>
            {m ? (
              <MemberCard member={m} />
            ) : (
              <View style={{ backgroundColor: COLORS.surface2, borderRadius: RADIUS.card, padding: 14 }}>
                <BodyText size={12.5} color={COLORS.warn}>Cargo vago. Se ninguém for contratado até a abertura da temporada, um interino nota 2 assume.</BodyText>
              </View>
            )}
            <View className="flex-row" style={{ gap: 10 }}>
              {m && !m.interim ? (
                <GhostButton label="Demitir" color={COLORS.bad} onPress={() => setConfirmFire(role)} style={{ flex: 1, borderColor: withAlpha(COLORS.bad, 0.55) }} />
              ) : null}
              {open && candidates.length ? (
                m
                  ? <GhostButton label={`Candidatos (${candidates.length})`} onPress={() => setHiringRole(role)} style={{ flex: 1 }} />
                  : <CtaButton label="Contratar" sub={`${candidates.length} candidatos`} onPress={() => setHiringRole(role)} size={16} style={{ flex: 1, minHeight: 46 }} />
              ) : null}
            </View>
          </View>
        );
      })}

      {!open ? (
        <BodyText size={12} color={COLORS.dim}>
          Contratações abrem na entressafra (draft e agência livre). Durante a temporada só dá para demitir: um interino nota 2 fica no cargo até lá.
        </BodyText>
      ) : null}

      {/* Fire confirmation */}
      <Modal visible={!!firing} transparent animationType="fade" onRequestClose={() => setConfirmFire(null)}>
        <Pressable accessible={false} className="flex-1 bg-black/70 items-center justify-center p-4" onPress={() => setConfirmFire(null)}>
          <Pressable className="bg-panel border border-line rounded-3xl p-6 w-full max-w-sm gap-4" onPress={(e) => e.stopPropagation()}>
            <Text className="text-xl font-black uppercase italic tracking-tight text-fg">Demitir?</Text>
            <Text className="text-sm text-fg-dim leading-5">
              <Text className="font-bold text-fg">{firing?.name}</Text> deixa o cargo. Os {money(firing?.salary ?? 0)} por ano continuam no orçamento por mais {firing?.years} {firing?.years === 1 ? 'temporada' : 'temporadas'}.
              {open ? ' O cargo fica vago para você contratar.' : ' Um interino nota 2 assume até a entressafra.'}
            </Text>
            <View className="flex-row gap-3 justify-end">
              <Pressable accessibilityRole="button" onPress={() => setConfirmFire(null)} className="px-4 py-2 rounded-xl"><Text className="text-sm font-bold text-fg-soft">Cancelar</Text></Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => { if (confirmFire) onFire(confirmFire); setConfirmFire(null); }}
                className="px-4 py-2 rounded-xl bg-red-600"
              >
                <Text className="text-sm font-black uppercase text-white">Demitir</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Candidates for one role */}
      <BottomSheet
        visible={!!hiringRole}
        onClose={() => setHiringRole(null)}
        title={hiringRole ? `Candidatos · ${ROLE_LABEL[hiringRole]}` : ''}
        maxHeight="82%"
      >
        <BodyText size={12} color={COLORS.dim}>
          {money(room)} livres no orçamento.{hiringRole && team.staff?.[hiringRole] && !team.staff[hiringRole]!.interim
            ? ' Contratar substitui o atual, e o salário dele vira dinheiro morto.'
            : ''}
        </BodyText>
        {(hiringRole ? market?.[hiringRole] ?? [] : []).map((c) => {
          const fits = c.salary <= room;
          return (
            <MemberCard
              key={c.id}
              member={c}
              action={
                <CtaButton
                  label={fits ? 'Contratar' : 'Acima do orçamento'}
                  disabled={!fits}
                  onPress={() => { onHire(c); setHiringRole(null); }}
                  size={15}
                  style={{ minHeight: 42 }}
                />
              }
            />
          );
        })}
      </BottomSheet>
    </Panel>
  );
};

export default StaffPanel;
