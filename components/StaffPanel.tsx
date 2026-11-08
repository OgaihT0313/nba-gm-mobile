import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Team, StaffMember, StaffRole, SeasonState } from '../types';
import {
  STAFF_ROLES, ROLE_LABEL, staffBudget, staffPayroll, staffRoom, effectLine, traitLine, isHiringOpen, NEUTRAL_RATING,
  extendBlock, extensionTerms, EXTENSION_RAISE, poachChance,
} from '../services/staffService';
import Icon from './Icon';
import { MonoLabel, Panel, CtaButton, GhostButton, BodyText, Meter } from './ui/kit';
import { COLORS, FONT, RADIUS, withAlpha } from '../src/theme/tokens';
import BottomSheet from './ui/BottomSheet';
import ConfirmDialog, { dialogText, dialogStrong } from './ui/ConfirmDialog';

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

export const MemberCard: React.FC<{
  member: StaffMember;
  action?: React.ReactNode;
  // Read-only (Minha Carreira): the effect line can say who it lands on.
  note?: string;
}> = ({ member, action, note }) => (
  <View style={{ backgroundColor: COLORS.surface2, borderRadius: RADIUS.card, padding: 14, gap: 8 }}>
    <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT.cond800, fontSize: 19, lineHeight: 20, color: COLORS.text }}>{member.name}</Text>
        <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim, marginTop: 3 }}>
          {member.age} anos · {member.interim ? 'interino até a offseason' : `${member.years} ${member.years === 1 ? 'ano' : 'anos'} de contrato`} · {money(member.salary)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontFamily: FONT.cond800, fontSize: 18, lineHeight: 18, color: ratingColor(member.rating) }}>Nota {member.rating}</Text>
        <Pips rating={member.rating} />
      </View>
    </View>
    <Text style={{ fontFamily: FONT.body500, fontSize: 12.5, color: COLORS.text }}>{effectLine(member.role, member.rating)}</Text>
    {traitLine(member) ? (
      <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.textSoft }}>{traitLine(member)}</Text>
    ) : null}
    {member.extension ? (
      <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.good }}>
        Renovado: mais {member.extension.years} anos a {money(member.extension.salary)} a partir da próxima temporada.
      </Text>
    ) : null}
    {note ? <Text style={{ fontFamily: FONT.body500, fontSize: 12, color: COLORS.dim }}>{note}</Text> : null}
    {action}
  </View>
);

interface StaffPanelProps {
  team: Team;
  status: SeasonState['status'];
  market?: SeasonState['staffMarket'];
  onHire: (member: StaffMember) => void;
  onFire: (role: StaffRole) => void;
  onExtend: (role: StaffRole) => void;
}

// Whether this one could be hired away when his deal runs out (staffOffseason).
const atRisk = (m: StaffMember) => !m.interim && !m.extension && m.years === 1 && poachChance(m.rating, 0.5) > 0;

const StaffPanel: React.FC<StaffPanelProps> = ({ team, status, market, onHire, onFire, onExtend }) => {
  const [hiringRole, setHiringRole] = useState<StaffRole | null>(null);
  const [confirmFire, setConfirmFire] = useState<StaffRole | null>(null);
  const [confirmExtend, setConfirmExtend] = useState<StaffRole | null>(null);
  const extending = confirmExtend ? team.staff?.[confirmExtend] : undefined;
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
              <MemberCard
                member={m}
                note={atRisk(m)
                  ? 'Último ano de contrato. Sem renovação, um time da CPU pode levá-lo na offseason, e a chance cresce se o seu time ganhar.'
                  : undefined}
              />
            ) : (
              <View style={{ backgroundColor: COLORS.surface2, borderRadius: RADIUS.card, padding: 14 }}>
                <BodyText size={12.5} color={COLORS.warn}>Cargo vago. Se ninguém for contratado até a abertura da temporada, um interino nota 2 assume.</BodyText>
              </View>
            )}
            <View className="flex-row" style={{ gap: 10 }}>
              {m && !m.interim ? (
                <GhostButton label="Demitir" color={COLORS.bad} onPress={() => setConfirmFire(role)} style={{ flex: 1, borderColor: withAlpha(COLORS.bad, 0.55) }} />
              ) : null}
              {m && !m.interim && !m.extension && m.years === 1 ? (
                <GhostButton label="Renovar" onPress={() => setConfirmExtend(role)} style={{ flex: 1 }} />
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
          Contratações abrem na offseason (draft e agência livre). Durante a temporada só dá para demitir: um interino nota 2 fica no cargo até lá.
        </BodyText>
      ) : null}

      {/* Fire confirmation */}
      <ConfirmDialog
        visible={!!firing}
        title="Demitir?"
        onClose={() => setConfirmFire(null)}
        confirmLabel="Demitir"
        confirmColor={COLORS.bad}
        onConfirm={() => { if (confirmFire) onFire(confirmFire); setConfirmFire(null); }}
      >
        <Text style={dialogText}>
          <Text style={dialogStrong}>{firing?.name}</Text> deixa o cargo. Os {money(firing?.salary ?? 0)} por ano continuam no orçamento por mais {firing?.years} {firing?.years === 1 ? 'temporada' : 'temporadas'}.
          {open ? ' O cargo fica vago para você contratar.' : ' Um interino nota 2 assume até a offseason.'}
        </Text>
      </ConfirmDialog>

      {/* Early renewal: costs more now than the market would, keeps him. */}
      {extending && confirmExtend ? (() => {
        const terms = extensionTerms(extending);
        const block = extendBlock(team, confirmExtend);
        return (
          <ConfirmDialog
            visible
            title="Renovar?"
            onClose={() => setConfirmExtend(null)}
            confirmLabel="Renovar"
            confirmColor={COLORS.good}
            disabled={!!block}
            onConfirm={() => { onExtend(confirmExtend); setConfirmExtend(null); }}
          >
            <Text style={dialogText}>
              <Text style={dialogStrong}>{extending.name}</Text> fica por mais {terms.years} anos a {money(terms.salary)} por ano ({Math.round((EXTENSION_RAISE - 1) * 100)}% a mais), a partir da próxima temporada. Esperar o contrato acabar sai mais barato, mas ele vai para o mercado{atRisk(extending) ? ' e um time da CPU pode levá-lo antes' : ''}.
            </Text>
            {block ? <Text style={[dialogStrong, { color: COLORS.bad }]}>{block}.</Text> : null}
          </ConfirmDialog>
        );
      })() : null}

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
