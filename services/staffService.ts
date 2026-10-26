// Type-only so this module can also be exercised directly by node
// (--experimental-strip-types) in a harness — see the pattern note in
// careerService.ts / draftService.ts.
import type { Team, StaffMember, StaffRole, Event, SeasonState } from '../types';

// The staff beyond the head coach (PLANO-STAFF.md). One rule keeps the league
// calibrated: every role touches ONE system, and its effect is measured
// against the average professional. A rating 3 changes nothing; 5 helps and 1
// hurts by the same amount. All 30 teams carry a staff whose ratings average
// ~3 (scripts/check_staff.ts measures it), so diagnose_season and the backtest
// stay where they are — staff moves wins BETWEEN teams, it doesn't inflate the
// league. A team with no staff at all (Minha Carreira's league, for now)
// reads as neutral everywhere.

export const STAFF_ROLES: StaffRole[] = ['trainer', 'scout', 'analyst', 'locker'];

export const ROLE_LABEL: Record<StaffRole, string> = {
    trainer: 'Preparador físico',
    scout: 'Olheiro-chefe',
    analyst: 'Analista de desempenho',
    locker: 'Assistente de vestiário',
};

export const NEUTRAL_RATING = 3;
export const INTERIM_RATING = 2;

// What a professional costs a season by rating, before a ±10% personal spread.
// Four 3s cost ~US$ 6M — exactly a small market's budget — and four 5s ~16M,
// which no budget reaches: the choice is where to spend. Tuned (prototype in
// the session notes, then check_staff) so CPU teams spending to their budget
// land on a league average of ~3.
const BASE_SALARY: Record<number, number> = {
    1: 500_000, 2: 900_000, 3: 1_500_000, 4: 2_500_000, 5: 4_000_000,
};
const INTERIM_SALARY = BASE_SALARY[INTERIM_RATING];

// The staff budget comes from the market, separate from the players' cap.
// No market data ships with the teams, so it's an explicit table; any id not
// in it (an era's relocated franchise) is a mid market.
const BIG_MARKETS = new Set(['lal', 'lac', 'nyk', 'bkn', 'gsw', 'chi', 'bos']);
const SMALL_MARKETS = new Set([
    'cha', 'cle', 'ind', 'mem', 'mil', 'min', 'nop', 'okc', 'orl', 'por', 'sac', 'sas', 'uta',
]);
export const staffBudget = (team: Team): number =>
    BIG_MARKETS.has(team.id) ? 9_000_000 : SMALL_MARKETS.has(team.id) ? 6_000_000 : 7_500_000;

/** Everything charged to the staff budget this season: salaries + dead money. */
export const staffPayroll = (team: Team): number => {
    let total = 0;
    STAFF_ROLES.forEach((r) => { total += team.staff?.[r]?.salary ?? 0; });
    (team.staffDeadMoney ?? []).forEach((d) => { total += d.amount; });
    return total;
};

export const staffRoom = (team: Team): number => staffBudget(team) - staffPayroll(team);

export const ratingOf = (team: Team | undefined, role: StaffRole): number =>
    team?.staff?.[role]?.rating ?? NEUTRAL_RATING;

// --- effects -----------------------------------------------------------------
// All linear in (rating - 3), so the league average stays put.

// The plan's first numbers (x1.25 -> x0.75 on the odds, x1.2 -> x0.8 on the
// duration) multiply: measured, a 5 lost 62% fewer games than a 1 against a
// 25-35% target. These land on ~30%.
/** Preparador: odds the team picks up an injury on a given night, x1.1 -> x0.9. */
export const trainerInjuryMult = (team: Team | undefined): number => 1 - (ratingOf(team, 'trainer') - 3) * 0.05;
/** Preparador: games an injury costs, x1.08 -> x0.92. */
export const trainerDurationMult = (team: Team | undefined): number => 1 - (ratingOf(team, 'trainer') - 3) * 0.04;
/** Preparador: how fast load builds with minutes, x1.15 -> x0.85 (only the build-up; resting drains it as before). */
export const trainerLoadMult = (team: Team | undefined): number => 1 - (ratingOf(team, 'trainer') - 3) * 0.075;

const at = (rating: number, table: number[]) => table[Math.max(1, Math.min(5, Math.round(rating))) - 1];
/** Olheiro: scouting reports per draft (was a fixed 12, the rating 3 value). */
export const scoutBudgetFor = (rating: number): number => at(rating, [8, 10, 12, 14, 17]);
/** Olheiro: share of the error bar that survives one report (was a fixed 0.55). */
export const scoutStepFor = (rating: number): number => at(rating, [0.6, 0.58, 0.55, 0.53, 0.5]);
/** Olheiro: odds a report reads a prospect's potential tier right (the board's own read is 0.65). */
export const scoutPotentialAccuracy = (rating: number): number => at(rating, [0.55, 0.6, 0.65, 0.72, 0.8]);

/** Vestiário: added to every player's morale target, −4 → +4. */
export const lockerMoraleShift = (team: Team | undefined): number => (ratingOf(team, 'locker') - 3) * 1;
/**
 * Vestiário: how far the morale line where a good player asks out
 * (TRADE_REQUEST_MORALE, 25) drops — 30 with a 1, 20 with a 5. Subtracted by
 * decisionService; kept as a shift so this module stays free of the engine.
 */
export const lockerRequestLineShift = (team: Team | undefined): number => (ratingOf(team, 'locker') - 3) * 0.75;

/** Analista: odds the opponent report names the play that really hurts them. */
export const analystAccuracy = (rating: number): number => at(rating, [0.6, 0.68, 0.75, 0.83, 0.9]);
/** Analista: points a quarter adds when the user calls the play a right report named. */
export const analystBonus = (rating: number): number => at(rating, [0.5, 0.875, 1.25, 1.625, 2]);

const pct = (mult: number) => `${mult < 1 ? '−' : '+'}${Math.round(Math.abs(1 - mult) * 100)}%`;
// Decimal point, like every stat and salary in the app ("34.4", "$0.8M").
const fmtPts = (v: number) => v.toFixed(1).replace(/\.0$/, '');

/** The effect in one line, for the Staff tab and the market. */
export const effectLine = (role: StaffRole, rating: number): string => {
    // The analyst is the exception: his report exists at every rating, since
    // it pays only in the game the user watches and only when he follows it.
    if (rating === NEUTRAL_RATING && role !== 'analyst') return 'Na média da liga: sem efeito';
    switch (role) {
        case 'trainer': {
            const team = { staff: { trainer: { rating } } } as unknown as Team;
            return `${pct(trainerInjuryMult(team))} de lesões, ${pct(trainerDurationMult(team))} no tempo fora`;
        }
        case 'scout':
            return `${scoutBudgetFor(rating)} avaliações por draft, potencial lido certo ${Math.round(scoutPotentialAccuracy(rating) * 100)}%`;
        case 'analyst':
            return `Relatório no intervalo acerta ${Math.round(analystAccuracy(rating) * 100)}%, +${fmtPts(analystBonus(rating))} pts no quarto se seguido`;
        case 'locker': {
            const team = { staff: { locker: { rating } } } as unknown as Team;
            const shift = lockerMoraleShift(team);
            return `Ânimo do elenco ${shift > 0 ? '+' : '−'}${Math.abs(shift)}, pedido de troca abaixo de ${fmtPts(25 - lockerRequestLineShift(team))}`;
        }
    }
};

// --- people ------------------------------------------------------------------

const FIRST_NAMES = [
    'Rick', 'Tom', 'Dave', 'Gregg', 'Brian', 'Alex', 'Sam', 'Kevin', 'Marcus', 'Paul',
    'Andre', 'Luis', 'Jeff', 'Ron', 'Tim', 'Dwane', 'Sean', 'Ryan', 'Pete', 'Gary',
    'Lisa', 'Becky', 'Natalie', 'Kara', 'Monica', 'Jenny', 'Sarah', 'Dana',
];
const LAST_NAMES = [
    'Carlisle', 'Brand', 'Presti', 'Ainge', 'Riley', 'Myers', 'Stone', 'Hammon',
    'Cole', 'Price', 'Moreno', 'Hughes', 'Kemp', 'Ortiz', 'Marsh', 'Doyle',
    'Fenwick', 'Reeves', 'Abbott', 'Lang', 'Tanaka', 'Sousa', 'Bishop', 'Grady',
];

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

const newId = (role: StaffRole) => `staff_${role}_${Math.random().toString(36).slice(2, 10)}`;

const salaryFor = (rating: number) => roundTo(BASE_SALARY[rating] * rand(0.9, 1.1), 50_000);

export const makeMember = (role: StaffRole, rating: number, opts: { interim?: boolean } = {}): StaffMember => {
    const r = clamp(Math.round(rating), 1, 5);
    return {
        id: newId(role),
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        // The best ones have been around: experience is most of the rating.
        age: randInt(30, 40) + (r - 1) * 4 + randInt(0, 6),
        role,
        rating: opts.interim ? INTERIM_RATING : r,
        salary: opts.interim ? INTERIM_SALARY : salaryFor(r),
        years: opts.interim ? 1 : randInt(1, 3),
        interim: opts.interim || undefined,
    };
};

// A team spends its budget: everyone starts at 1 and random roles move up a
// rating for as long as the next step still fits. Big markets end up around
// 3.5, small ones around 2.7, the league around 3 — measured.
export const generateTeamStaff = (team: Team): NonNullable<Team['staff']> => {
    const budget = staffBudget(team);
    const members: Record<StaffRole, StaffMember> = {
        trainer: makeMember('trainer', 1), scout: makeMember('scout', 1),
        analyst: makeMember('analyst', 1), locker: makeMember('locker', 1),
    };
    const spent = () => STAFF_ROLES.reduce((s, r) => s + members[r].salary, 0);
    for (;;) {
        const open = STAFF_ROLES.filter((r) => members[r].rating < 5).sort(() => Math.random() - 0.5);
        let moved = false;
        for (const r of open) {
            const next = { ...members[r], rating: members[r].rating + 1, salary: salaryFor(members[r].rating + 1) };
            if (spent() - members[r].salary + next.salary <= budget) {
                members[r] = next;
                moved = true;
                break;
            }
        }
        if (!moved) break;
    }
    // Age goes with the final rating, not the 1 everyone started at.
    STAFF_ROLES.forEach((r) => {
        const m = members[r];
        members[r] = { ...m, age: randInt(30, 40) + (m.rating - 1) * 4 + randInt(0, 6) };
    });
    return members;
};

/** Opening-night staffs for a new save. */
export const initStaff = (teams: Team[]): Team[] =>
    teams.map((t) => ({ ...t, staff: generateTeamStaff(t), staffDeadMoney: undefined }));

/** Old saves: every team gets an average staff, so nothing changes mid-season. */
export const neutralStaff = (): NonNullable<Team['staff']> => {
    const staff: NonNullable<Team['staff']> = {};
    STAFF_ROLES.forEach((r) => { staff[r] = { ...makeMember(r, NEUTRAL_RATING), salary: BASE_SALARY[NEUTRAL_RATING] }; });
    return staff;
};

export const ensureStaff = (season: SeasonState): SeasonState => {
    // Minha Carreira's league is staff-less on purpose (phase 3 of the plan).
    if (season.teams.every((t) => t.staff)) return season;
    return { ...season, teams: season.teams.map((t) => (t.staff ? t : { ...t, staff: neutralStaff() })) };
};

// --- the offseason -------------------------------------------------------------

// The CPU refills a vacated role with the best rating it can afford while
// leaving a rating-1 salary for every other opening, and spending no more
// than ~1.8x an even share of what's left (one opening can't eat the room of
// three). Measured by check_staff: the league stays at ~3 and inside budget
// after ten offseasons. The first version took the best rating the whole
// room bought — the first opening swallowed it, the rest were forced to 1
// and over budget, and the league sank to 2.7 within a decade.
const MAX_SALARY = (rating: number) => BASE_SALARY[rating] * 1.1;
const refillCpuRole = (team: Team, role: StaffRole): StaffMember => {
    const others = { ...team, staff: { ...team.staff, [role]: undefined } };
    const openings = STAFF_ROLES.filter((r) => !others.staff?.[r]).length;
    const left = staffRoom(others);
    const room = left - MAX_SALARY(1) * (openings - 1);
    const share = (left / openings) * 1.8;
    let r = 1;
    for (let k = 5; k >= 1; k--) if (MAX_SALARY(k) <= room && BASE_SALARY[k] <= share) { r = k; break; }
    return makeMember(role, r);
};

const retireChance = (age: number) => (age < 63 ? 0 : age < 67 ? 0.15 : age < 71 ? 0.4 : 1);

/**
 * One year passes for every staff: everyone ages, contracts and dead money
 * tick down, interims and expired deals leave, a few veterans retire. CPU
 * teams refill on the spot; the user's vacancies stay open for the market,
 * and whoever's deal just ran out comes back as a candidate (`expiring`).
 */
export const staffOffseason = (
    teams: Team[],
    userTeamId: string,
): { teams: Team[]; events: Event[]; expiring: StaffMember[] } => {
    const events: Event[] = [];
    const expiring: StaffMember[] = [];
    const next = teams.map((team) => {
        if (!team.staff) return team;
        const mine = team.id === userTeamId;
        const staff: NonNullable<Team['staff']> = {};
        STAFF_ROLES.forEach((role) => {
            const m = team.staff?.[role];
            if (!m) return;
            const aged = { ...m, age: m.age + 1, years: m.years - 1 };
            if (aged.interim) return;
            if (Math.random() < retireChance(aged.age)) {
                if (mine) events.push({ message: `🧢 ${aged.name} (${aged.age}), ${ROLE_LABEL[role].toLowerCase()}, se aposentou. O cargo está vago.`, type: 'info', teamIds: [team.id] });
                return;
            }
            if (aged.years <= 0) {
                if (mine) {
                    expiring.push(aged);
                    events.push({ message: `🧢 O contrato de ${aged.name} (${ROLE_LABEL[role].toLowerCase()}) acabou. Ele está entre os candidatos, se quiser renovar.`, type: 'info', teamIds: [team.id] });
                }
                return;
            }
            staff[role] = aged;
        });
        const deadMoney = (team.staffDeadMoney ?? [])
            .map((d) => ({ ...d, years: d.years - 1 }))
            .filter((d) => d.years > 0);
        let t: Team = { ...team, staff, staffDeadMoney: deadMoney.length ? deadMoney : undefined };
        if (!mine) {
            [...STAFF_ROLES].sort(() => Math.random() - 0.5).forEach((role) => {
                if (!t.staff?.[role]) t = { ...t, staff: { ...t.staff, [role]: refillCpuRole(t, role) } };
            });
        }
        return t;
    });
    return { teams: next, events, expiring };
};

// How good a job this is, the same read coachService uses (powerRank).
const jobQuality = (team: Team): number => clamp((30 - team.powerRank) / 29, 0, 1);

/**
 * The user's candidates for the offseason: 3 per role (4 for an open one),
 * pulled up by how attractive the job is, always with one affordable name, plus
 * whoever's contract just ran out at a 10% raise.
 */
export const buildStaffMarket = (team: Team, expiring: StaffMember[] = []): NonNullable<SeasonState['staffMarket']> => {
    const q = jobQuality(team);
    const market: NonNullable<SeasonState['staffMarket']> = {};
    STAFF_ROLES.forEach((role) => {
        const count = team.staff?.[role] ? 3 : 4;
        const list: StaffMember[] = [];
        for (let i = 0; i < count; i++) {
            list.push(makeMember(role, clamp(Math.round(1.6 + q * 2.8 + rand(-1.3, 1.3)), 1, 5)));
        }
        if (!list.some((m) => m.rating <= 2)) list[list.length - 1] = makeMember(role, randInt(1, 2));
        const back = expiring.find((m) => m.role === role);
        if (back) list.unshift({ ...back, years: randInt(1, 3), salary: roundTo(back.salary * 1.1, 50_000) });
        market[role] = list.sort((a, b) => b.rating - a.rating);
    });
    return market;
};

// --- the user's moves ----------------------------------------------------------

export const isHiringOpen = (status: SeasonState['status']): boolean =>
    status === 'draft' || status === 'free_agency' || status === 'offseason';

/** Why this hire can't happen, or null if it can. Replacing someone moves his salary to dead money, so the room needed is the new salary. */
export const hireBlock = (season: SeasonState, member: StaffMember): string | null => {
    if (!isHiringOpen(season.status)) return 'Contratações só na offseason';
    const team = season.teams.find((t) => t.id === season.userTeamId);
    if (!team) return 'Time não encontrado';
    if (member.salary > staffRoom(team)) return 'Acima do orçamento';
    return null;
};

const firedToDeadMoney = (team: Team, role: StaffRole): Team['staffDeadMoney'] => {
    const m = team.staff?.[role];
    if (!m || m.interim) return team.staffDeadMoney;
    return [...(team.staffDeadMoney ?? []), { name: m.name, role, amount: m.salary, years: m.years }];
};

export const hireStaff = (season: SeasonState, member: StaffMember): SeasonState => {
    if (hireBlock(season, member)) return season;
    const team = season.teams.find((t) => t.id === season.userTeamId)!;
    const role = member.role;
    const replaced = team.staff?.[role];
    const updated: Team = {
        ...team,
        staffDeadMoney: firedToDeadMoney(team, role),
        staff: { ...team.staff, [role]: member },
    };
    const market = season.staffMarket?.[role]?.filter((m) => m.id !== member.id);
    const replacedNote = replaced && !replaced.interim ? ` ${replaced.name} deixa o cargo.` : '';
    return {
        ...season,
        teams: season.teams.map((t) => (t.id === team.id ? updated : t)),
        staffMarket: season.staffMarket ? { ...season.staffMarket, [role]: market } : season.staffMarket,
        events: [{ message: `🧢 ${member.name} é o novo ${ROLE_LABEL[role].toLowerCase()} do ${team.name}.${replacedNote}`, type: 'info' as const, teamIds: [team.id] }, ...season.events].slice(0, 60),
    };
};

/** Fire whoever holds `role`. Mid-season an interim (rating 2) holds the job until the offseason; in the offseason the job just opens. */
export const fireStaff = (season: SeasonState, role: StaffRole): SeasonState => {
    const team = season.teams.find((t) => t.id === season.userTeamId);
    const m = team?.staff?.[role];
    if (!team || !m || m.interim) return season;
    const staff = { ...team.staff };
    if (isHiringOpen(season.status)) delete staff[role];
    else staff[role] = makeMember(role, INTERIM_RATING, { interim: true });
    const updated: Team = { ...team, staff, staffDeadMoney: firedToDeadMoney(team, role) };
    return {
        ...season,
        teams: season.teams.map((t) => (t.id === team.id ? updated : t)),
        events: [{ message: `🧢 ${m.name} foi demitido (${ROLE_LABEL[role].toLowerCase()}). O salário restante segue no orçamento.`, type: 'info' as const, teamIds: [team.id] }, ...season.events].slice(0, 60),
    };
};

/** Opening night: any role the user left open goes to an interim. */
export const fillUserVacancies = (team: Team): { team: Team; filled: StaffRole[] } => {
    if (!team.staff) return { team, filled: [] };
    const filled = STAFF_ROLES.filter((r) => !team.staff?.[r]);
    if (!filled.length) return { team, filled };
    const staff = { ...team.staff };
    filled.forEach((r) => { staff[r] = makeMember(r, INTERIM_RATING, { interim: true }); });
    return { team: { ...team, staff }, filled };
};
