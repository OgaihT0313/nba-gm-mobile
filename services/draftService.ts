// Type-only so this module can also be exercised directly by node
// (--experimental-strip-types), which would otherwise try to resolve ../types at
// runtime — see the balance harness note in careerService.ts.
import type { Player, Team, DraftState, DraftPick, DraftSlot, DraftPickAsset, Event, ScoutReport } from '../types';
import { getPlayerPositions, LINEUP_POSITIONS, ATTRIBUTE_META, getPlayerAttributes } from '../constants';

// The rookie draft is a single round (30 picks) held in the offseason before
// free agency. nba_api doesn't model *future* draft classes, so prospects are
// generated procedurally: young (19-21), lower-rated than established pros but
// with real upside (weighted toward A/B potential), so they're development
// projects — not plug-and-play stars. Ratings taper by projected slot so the
// #1 pick is a clear prize and late picks are fliers.

const FIRST_NAMES = [
    'Jalen', 'Amari', 'DeShawn', 'Malik', 'Tyrese', 'Cameron', 'Jaylen', 'Keon',
    'Trey', 'Dariq', 'Zion', 'Isaiah', 'Marcus', 'Elijah', 'Xavier', 'Devin',
    'Bronny', 'Cooper', 'Ace', 'Kel', 'Jaxon', 'Omar', 'Nasir', 'Tariq',
    'Emoni', 'Dante', 'Rashad', 'Julian', 'Kobe', 'Bilal',
];
const LAST_NAMES = [
    'Williams', 'Johnson', 'Carter', 'Bell', 'Freeman', 'Okafor', 'Mensah',
    'Robinson', 'Hayes', 'Bruno', 'Nowak', 'Petrov', 'Diallo', 'Traore',
    'Silva', 'Adeyemi', 'Kovač', 'Vasquez', 'Booker', 'Kline', 'Whitmore',
    'Ndiaye', 'Osei', 'Bogdan', 'Reyes', 'Fontaine', 'Ivić', 'Cho', 'Abara',
    'Yamamoto',
];

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Prospects have to be draftable into a real starting slot, so they're rolled
// on the same five positions the rest of the league uses.
const POS: Player['pos'][] = LINEUP_POSITIONS;

// A prospect's projected slot (0-indexed) drives their rating band and how
// likely they are to have elite potential.
const projectedOvr = (slot: number) => clamp(Math.round(76 - slot * 0.5 + rand(-2.5, 2.5)), 61, 77);

const projectedPotential = (slot: number): Player['potential'] => {
    const roll = Math.random();
    if (slot < 5) return roll < 0.7 ? 'A' : 'B';
    if (slot < 14) return roll < 0.4 ? 'A' : roll < 0.85 ? 'B' : 'C';
    if (slot < 24) return roll < 0.2 ? 'A' : roll < 0.65 ? 'B' : 'C';
    return roll < 0.1 ? 'B' : roll < 0.6 ? 'C' : 'D';
};

// Rookie-scale-ish salary: higher picks earn more, all modest vs veterans.
const rookieSalary = (slot: number) => Math.round((30 - slot) * 190_000 + 1_050_000);

// Ids are name-derived, and the name space is only FIRST × LAST (900 combos).
// A long save draws ~30 a season, so collisions are not hypothetical — they're
// near-certain within a handful of seasons. `usedIds` MUST therefore be seeded
// with every id already in the league (see generateDraftClass), because the
// caller merges prospects over the existing player map: a repeated id would
// silently overwrite a real, rostered, mid-career player. The numeric suffix is
// the escape hatch once the name space saturates, so this can never spin
// forever either.
const makeProspect = (slot: number, usedIds: Set<string>, idPrefix = 'rookie_'): Player => {
    let id = '';
    let name = '';
    for (let attempt = 0; ; attempt++) {
        name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        const base = idPrefix + name.toLowerCase().replace(/[^a-z]+/g, '_');
        id = attempt < 12 ? base : `${base}_${attempt}`;
        if (!usedIds.has(id)) break;
    }
    usedIds.add(id);

    const ovr = projectedOvr(slot);
    const pos = pick(POS);
    // Spread the headline into off/def + a full attribute breakdown centred on
    // ovr, so rookies flow through the same sim/UI code paths as everyone else.
    const spread = () => clamp(ovr + randInt(-6, 6), 58, 82);
    const off = clamp(ovr + randInt(-3, 3), 58, 82);
    const def = clamp(ovr + randInt(-3, 3), 58, 82);

    return {
        id,
        name,
        pos,
        positions: [pos],
        ovr,
        off,
        def,
        attributes: {
            shooting: spread(), finishing: spread(), playmaking: spread(),
            perimeterD: spread(), interiorD: spread(), rebounding: spread(),
            athleticism: clamp(ovr + randInt(-2, 8), 60, 90), // rookies skew athletic
        },
        espnId: null,
        nbaId: null,
        age: randInt(19, 21),
        number: randInt(0, 55),
        potential: projectedPotential(slot),
        salary: rookieSalary(slot),
        contractYears: 3, // standard rookie-scale length
    };
};

// --- FOG OF WAR ------------------------------------------------------------
// A prospect's real rating is generated above, but the draft never shows it.
// What the user AND the CPU see is a ScoutReport: a projected rating with an
// error bar. Two rules make this a decision instead of decoration:
//
//   1. The evaluation error is independent of the truth, and is scaled to spill
//      past the band on purpose — roughly 8% of a class lands outside its own
//      range. That's where real busts and steals live.
//   2. The CPU drafts off this same public board, not off the truth. A prospect
//      the consensus underrates slides down the board and can fall to a user
//      who spent scouting on him — which is the entire point of the budget.

// Scouting reports the user gets per draft. A prospect costs 1-3 reports to
// fully unlock (see scoutProspect), so this buys certainty on roughly a fifth
// of the class: enough to work a shortlist, never enough to solve the board.
export const SCOUT_BUDGET = 12;

// How much of the error bar survives one scouting report.
const SCOUT_STEP = 0.55;

// A wider band means less film and more disagreement. Correlating it with age
// is safe (age is public) and reads true — an 19-year-old is a projection, not
// a known quantity.
const MAX_UNCERTAINTY = 12; // randInt(3,10) at its top, +2 for a teenager
const initialUncertainty = (p: Player) => randInt(3, 10) + (p.age <= 19 ? 2 : 0);

// Triangular noise (mean of two uniforms): usually a small miss, occasionally a
// wild one. The 1.4 multiplier is what lets the truth escape the band.
const evaluationError = (uncertainty: number) =>
    Math.round(((rand(-1, 1) + rand(-1, 1)) / 2) * uncertainty * 1.4);

const ESTIMATE_FLOOR = 55;
const ESTIMATE_CEIL = 85;

const noisyEstimate = (p: Player, uncertainty: number) =>
    clamp(p.ovr + evaluationError(uncertainty), ESTIMATE_FLOOR, ESTIMATE_CEIL);

// The widest a projected band can ever be plotted. The draft screen draws its
// rail from these rather than from a guessed 60-99: a band is estimate ±
// uncertainty, so it reaches below the rating floor, and hardcoding the axis
// produced a card reading "46-66" against a rail labelled "60 … 99".
export const PROJECTION_FLOOR = ESTIMATE_FLOOR - MAX_UNCERTAINTY;
export const PROJECTION_CEIL = ESTIMATE_CEIL + MAX_UNCERTAINTY;

// Potential is a tier, so its fog is a chance of being off by one tier either
// way rather than a numeric band.
const POTENTIAL_TIERS: Player['potential'][] = ['A', 'B', 'C', 'D'];
const guessPotential = (real: Player['potential']): Player['potential'] => {
    if (Math.random() < 0.65) return real;
    const i = POTENTIAL_TIERS.indexOf(real);
    return pick([POTENTIAL_TIERS[i - 1], POTENTIAL_TIERS[i + 1]].filter(Boolean));
};

const makeScoutReport = (p: Player): ScoutReport => {
    const uncertainty = initialUncertainty(p);
    return {
        estimate: noisyEstimate(p, uncertainty),
        uncertainty,
        potentialGuess: guessPotential(p.potential),
        potentialKnown: false,
        reports: 0,
        notes: [],
    };
};

const POTENTIAL_CEILING: { [k in Player['potential']]: string } = {
    A: 'teto de franquia, pode ser o melhor jogador de um time grande',
    B: 'teto de titular forte, com chance de All-Star',
    C: 'teto de rotação sólida',
    D: 'teto de reserva de fim de banco',
};

// Notes are read off the prospect's REAL attributes: they're the concrete payoff
// for spending a report and a tell even before the band closes (elite shooting
// on a projected-68 kid says the projection is low). Order matters — index 3 is
// the ceiling read, deliberately held back until the full reveal.
const scoutNotes = (p: Player): string[] => {
    const attrs = getPlayerAttributes(p);
    const ranked = [...ATTRIBUTE_META].sort((a, b) => attrs[b.key] - attrs[a.key]);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    return [
        `Melhor arma: ${best.label.toLowerCase()} (${attrs[best.key]}).`,
        `Ponto cego: ${worst.label.toLowerCase()} (${attrs[worst.key]}).`,
        `${p.age} anos, atletismo ${attrs.athleticism} — corpo ${attrs.athleticism >= 78 ? 'pronto' : 'cru'} para a liga.`,
        `Leitura final: ${POTENTIAL_CEILING[p.potential]}.`,
    ];
};

// Spends one scouting report: the band tightens and the estimate is re-drawn
// inside it, so it converges on reality without ever being a straight reveal.
// Once the band would close to 1 it snaps shut — exact rating, true potential,
// and every note still unread. Pure; returns null when the action isn't
// available (no budget, unknown prospect, or nothing left to learn) so the
// caller can leave state alone.
export const scoutProspect = (
    draft: DraftState,
    players: { [id: string]: Player },
    playerId: string,
): DraftState | null => {
    const report = draft.reports[playerId];
    const p = players[playerId];
    if (!report || !p || draft.scoutBudget <= 0 || report.potentialKnown) return null;

    const tightened = Math.floor(report.uncertainty * SCOUT_STEP);
    const solved = tightened <= 1;
    const uncertainty = solved ? 0 : tightened;
    const facts = scoutNotes(p);
    const revealed = solved
        ? [...facts.slice(report.reports, 3), facts[3]]
        : [facts[Math.min(report.reports, 2)]];

    const next: ScoutReport = {
        estimate: solved ? p.ovr : noisyEstimate(p, uncertainty),
        uncertainty,
        potentialGuess: solved ? p.potential : report.potentialGuess,
        potentialKnown: solved,
        reports: report.reports + 1,
        notes: [...report.notes, ...revealed],
    };
    return {
        ...draft,
        reports: { ...draft.reports, [playerId]: next },
        scoutBudget: draft.scoutBudget - 1,
    };
};

// Generates a 30-prospect class. Returns the prospect map (to merge into
// SeasonState.players), the league's scouting report on each of them, and their
// ids in projected-slot order (best first).
export const generateDraftClass = (
    size = 30,
    takenIds: Iterable<string> = [],
): { prospects: { [id: string]: Player }; reports: { [id: string]: ScoutReport }; ids: string[] } => {
    const usedIds = new Set<string>(takenIds);
    const prospects: { [id: string]: Player } = {};
    const reports: { [id: string]: ScoutReport } = {};
    const ids: string[] = [];
    for (let slot = 0; slot < size; slot++) {
        const p = makeProspect(slot, usedIds);
        // Flags the true rating as not-yet-public; applyPick clears it. Every
        // list that ranks players by ovr has to skip these (see Player.prospect).
        p.prospect = true;
        prospects[p.id] = p;
        reports[p.id] = makeScoutReport(p);
        ids.push(p.id);
    }
    return { prospects, reports, ids };
};

// Undrafted fringe talent entering the league alongside the draft class:
// undrafted FAs, two-way bodies, international signings. They go straight into
// the player pool on no roster, so getFreeAgents surfaces them on the market.
// Slots are deliberately worse than the draft's late first round: these are
// depth pieces, not a second round.
//
// NOTE: there is no retirement system, so nobody ever leaves the player pool —
// every offseason adds these 10 plus the 30-man draft class with zero exits.
// Fine for a save of a handful of seasons; a very long save will accumulate an
// ever-growing roster of players no team ever signs.
export const generateUndraftedClass = (size = 10, takenIds: Iterable<string> = []): { players: { [id: string]: Player }; ids: string[] } => {
    const usedIds = new Set<string>(takenIds);
    const players: { [id: string]: Player } = {};
    const ids: string[] = [];
    for (let i = 0; i < size; i++) {
        // Slot 30+ band — below every drafted prospect.
        const p = makeProspect(30 + randInt(0, 8), usedIds, 'udfa_');
        p.age = randInt(19, 23); // some are older, having played abroad
        p.salary = 1_050_000;    // minimum deal
        p.contractYears = 0;     // unsigned: a free agent, not on a rookie scale
        players[p.id] = p;
        ids.push(p.id);
    }
    return { players, ids };
};

// --- PICKS AS ASSETS -------------------------------------------------------
// A pick belongs to a DRAFT (1 = the draft held after season 1) and always keeps
// the id of the team whose record sets its slot, however many times it changes
// hands. That's the whole asset: you're buying someone else's future standing.

// How many drafts ahead every team holds its own pick for. Three is enough to
// build a real rebuild (sell now, collect later) without letting a GM mortgage a
// decade — and the window slides forward one draft every offseason.
export const PICK_WINDOW = 3;

export const pickAssetId = (originalTeamId: string, draft: number) => `pick_${originalTeamId}_${draft}`;

// Every team's own picks for the next PICK_WINDOW drafts, starting at
// `firstDraft`. Used at season init; the offseason tops the window back up.
export const initialPickAssets = (teams: Team[], firstDraft: number): Team[] =>
    teams.map(t => ({
        ...t,
        picks: Array.from({ length: PICK_WINDOW }, (_, i) => ({
            id: pickAssetId(t.id, firstDraft + i),
            originalTeamId: t.id,
            draft: firstDraft + i,
        })),
    }));

// Hands every team its own pick for the far edge of the window, once per
// offseason. Only its OWN — picks it traded away stay gone.
export const grantNextWindowPick = (teams: Team[], draft: number): Team[] =>
    teams.map(t => {
        const picks = t.picks ?? [];
        if (picks.some(p => p.originalTeamId === t.id && p.draft === draft)) return t;
        return { ...t, picks: [...picks, { id: pickAssetId(t.id, draft), originalTeamId: t.id, draft }] };
    });

// Where a team's pick would land if the draft were held on today's standings:
// 0-indexed slot, worst record first. Before any games are played there's no
// record to read, so the pre-season power rank stands in (a projected 60-win
// team is projected to pick late). This is the number the trade market prices,
// which is why a contender's pick is cheap and a tanking team's is gold.
export const projectedPickSlot = (originalTeamId: string, teams: Team[]): number => {
    const played = teams.reduce((n, t) => n + (t.wins || 0) + (t.losses || 0), 0);
    const ranked = played > 0
        ? [...teams].sort((a, b) => (a.wins || 0) - (b.wins || 0) || (b.losses || 0) - (a.losses || 0))
        : [...teams].sort((a, b) => b.powerRank - a.powerRank);
    const i = ranked.findIndex(t => t.id === originalTeamId);
    return i === -1 ? teams.length - 1 : i;
};

// NBA-style flattened lottery: only the 14 worst records are in it, the bottom
// three share the best odds, and just the top four slots are drawn — the rest
// fall in record order. Weights are the real odds ×10 so they stay integers.
const LOTTERY_TEAMS = 14;
const LOTTERY_DRAWN = 4;
const LOTTERY_ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];

const weightedDraw = (ids: string[], weights: number[]): number => {
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < ids.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
    }
    return ids.length - 1;
};

// Draft order by ORIGINAL team: lottery for the top four, reverse standings for
// everyone else. Losing buys odds, not a guarantee — which is the point.
export const runDraftLottery = (teams: Team[]): string[] => {
    const byRecord = [...teams]
        .sort((a, b) => (a.wins || 0) - (b.wins || 0) || (b.losses || 0) - (a.losses || 0))
        .map(t => t.id);

    const pool = byRecord.slice(0, LOTTERY_TEAMS);
    const weights = pool.map((_, i) => LOTTERY_ODDS[i] ?? 5);
    const winners: string[] = [];
    for (let d = 0; d < Math.min(LOTTERY_DRAWN, pool.length); d++) {
        const i = weightedDraw(pool, weights);
        winners.push(pool[i]);
        pool.splice(i, 1);
        weights.splice(i, 1);
    }
    // Winners first, then the rest of the lottery teams in record order, then
    // everyone who made the playoffs, also in record order.
    return [...winners, ...pool, ...byRecord.slice(LOTTERY_TEAMS)];
};

// Turns the lottery result into the actual board: each slot's owner is whoever
// holds that team's pick for this draft. Protected picks that land in the top N
// stay home and roll the obligation forward one draft (unprotected next time —
// the standard real-world structure). Consumes every pick for this draft, so the
// same asset can never be spent twice. Pure: returns updated teams.
export const buildDraftBoard = (
    teams: Team[],
    draft: number,
): { order: DraftSlot[]; teams: Team[]; events: Event[] } => {
    const lotteryOrder = runDraftLottery(teams);
    const events: Event[] = [];
    // Holder of each original team's pick for this draft, by original team id.
    const holderOf = new Map<string, { teamId: string; asset: DraftPickAsset }>();
    teams.forEach(t => (t.picks ?? []).forEach(p => {
        if (p.draft === draft) holderOf.set(p.originalTeamId, { teamId: t.id, asset: p });
    }));

    // A rolled obligation must MOVE the original team's next pick, never mint a
    // second claim on the same slot: two assets pointing at one team's pick in
    // one draft is unresolvable (a single-round draft has exactly one slot per
    // team), and the loser would silently vanish.
    const gained = new Map<string, DraftPickAsset[]>();
    const surrendered = new Set<string>(); // asset ids leaving their holder

    const order: DraftSlot[] = lotteryOrder.map((originalTeamId, slot) => {
        const held = holderOf.get(originalTeamId);
        // No holder at all shouldn't happen, but a missing asset must never cost
        // a team its pick — fall back to the original owner.
        if (!held || held.teamId === originalTeamId) return { teamId: originalTeamId, originalTeamId };

        const protection = held.asset.protection;
        if (protection && slot < protection) {
            const origTeam = teams.find(t => t.id === originalTeamId);
            const origName = origTeam?.name ?? originalTeamId;
            const holderName = teams.find(t => t.id === held.teamId)?.name ?? held.teamId;
            // The debt can only roll onto a pick the original team still owns.
            const next = (origTeam?.picks ?? []).find(p => p.originalTeamId === originalTeamId && p.draft === draft + 1);
            if (next) {
                surrendered.add(next.id);
                gained.set(held.teamId, [...(gained.get(held.teamId) ?? []), { ...next, protection: undefined }]);
                events.push({
                    message: `🔒 PROTEÇÃO: o pick do ${origName} caiu em #${slot + 1} (top ${protection} protegido) e ficou em casa. A dívida com o ${holderName} rola para o próximo draft, sem proteção.`,
                    type: 'trade',
                });
            } else {
                events.push({
                    message: `🔒 PROTEÇÃO: o pick do ${origName} caiu em #${slot + 1} (top ${protection} protegido) e ficou em casa. Sem pick futuro livre para rolar, a dívida com o ${holderName} expirou.`,
                    type: 'trade',
                });
            }
            return { teamId: originalTeamId, originalTeamId };
        }
        return { teamId: held.teamId, originalTeamId };
    });

    const newTeams = teams.map(t => {
        // Spending the draft: every asset for it leaves the books, along with any
        // pick handed over by a rolled protection, plus whatever came in.
        const kept = (t.picks ?? []).filter(p => p.draft !== draft && !surrendered.has(p.id));
        const incoming = gained.get(t.id) ?? [];
        return { ...t, picks: [...kept, ...incoming] };
    });

    return { order, teams: newTeams, events };
};

// Board value: projected rating plus an upside bonus, so rebuilders sensibly
// favour high-ceiling youth over a slightly higher-rated but capped prospect.
// This reads the SCOUT REPORT, never the player — it's what the league believes,
// and it's the only ranking either the CPU or the user's board is allowed to
// sort by. A prospect whose report is wrong is mis-ranked for everybody.
const potentialBonus: { [k in Player['potential']]: number } = { A: 6, B: 3, C: 1, D: 0 };
export const consensusValue = (report: ScoutReport) => report.estimate + potentialBonus[report.potentialGuess];

// Best available for a CPU team, lightly biased toward a positional need (a
// position not already well-represented in the top 8 of their roster).
const cpuChoose = (team: Team, draft: DraftState, players: { [id: string]: Player }): string => {
    const filled = new Set<string>();
    team.roster.slice(0, 8).forEach(pId => {
        const p = players[pId];
        if (p) getPlayerPositions(p).forEach(pos => filled.add(pos));
    });
    const scored = draft.available.map(id => {
        const needBonus = getPlayerPositions(players[id]).some(pos => !filled.has(pos)) ? 3 : 0;
        return { id, score: consensusValue(draft.reports[id]) + needBonus };
    });
    return scored.sort((a, b) => b.score - a.score)[0].id;
};

// Smallest miss that can ever be called a steal or a bust.
const SURPRISE_FLOOR = 5;

export type DraftVerdict = 'steal' | 'bust' | null;

// A pick only earns a headline when the truth escaped what the board CLAIMED to
// know, so the threshold scales with the error bar the prospect carried: a ±12
// mystery landing 7 points high is a Tuesday, the same miss on a settled
// prospect is a scandal. A fully scouted prospect (band 0, estimate = real
// rating) can never trigger it — which is exactly the point of scouting.
// Measured over 12k generated prospects: ~2.6 headlines per 30-pick draft.
export const draftVerdict = (real: number, projected: number, band: number): DraftVerdict => {
    const delta = real - projected;
    const margin = Math.max(SURPRISE_FLOOR, band);
    return delta >= margin ? 'steal' : delta <= -margin ? 'bust' : null;
};

// Applies one pick: adds the prospect to the team's roster (re-sorted by OVR,
// like every other roster mutation), lifts the fog on that player, and records
// it. Pure — returns new objects, including an updated player map.
const applyPick = (
    draft: DraftState,
    teams: Team[],
    players: { [id: string]: Player },
    playerId: string
): { draft: DraftState; teams: Team[]; players: { [id: string]: Player }; event: Event } => {
    const overall = draft.picks.length + 1;
    const slot = draft.order[draft.picks.length];
    const teamId = slot.teamId;
    const via = slot.originalTeamId !== slot.teamId ? slot.originalTeamId : undefined;
    const report = draft.reports[playerId];
    const projected = report?.estimate ?? players[playerId].ovr;
    const band = report?.uncertainty ?? 0;
    // Drafted means in the building: the truth about this player becomes public,
    // and what the board had projected is kept alongside it so a bust or a steal
    // stays legible long after the draft.
    const p: Player = { ...players[playerId], prospect: undefined, draftInfo: { pick: overall, projected, band } };
    const newPlayers = { ...players, [playerId]: p };
    const newTeams = teams.map(t =>
        t.id === teamId
            ? { ...t, roster: [...t.roster, playerId].sort((a, b) => (newPlayers[b]?.ovr || 0) - (newPlayers[a]?.ovr || 0)) }
            : t
    );
    const pickRecord: DraftPick = { pick: overall, teamId, playerId, viaTeamId: via };
    const picks = [...draft.picks, pickRecord];
    const newDraft: DraftState = {
        ...draft,
        picks,
        available: draft.available.filter(id => id !== playerId),
        complete: picks.length >= draft.order.length,
    };
    const teamName = teams.find(t => t.id === teamId)?.name ?? teamId;
    const viaLabel = via ? ` (via ${teams.find(t => t.id === via)?.name ?? via})` : '';
    const surprise = draftVerdict(p.ovr, projected, band);
    const verdict = surprise === 'steal' ? ' 🎯 ACHADO DO DRAFT!' : surprise === 'bust' ? ' 💀 FUROU.' : '';
    const event: Event = {
        message: `🎓 DRAFT (pick ${overall}${viaLabel}): ${teamName} seleciona ${p.name} (${p.pos}, ${p.ovr} OVR — projetado ${projected}, potencial ${p.potential}).${verdict}`,
        type: 'trade',
    };
    return { draft: newDraft, teams: newTeams, players: newPlayers, event };
};

// Runs the draft forward, letting the CPU auto-pick, and stops either when the
// user's team is on the clock or the draft is complete. Used both to reach the
// user's first pick and to resume after they make one. Deterministic-ish (CPU
// choice is value-based; only prospect generation used RNG, already done).
export const advanceDraftToUser = (
    draft: DraftState,
    teams: Team[],
    players: { [id: string]: Player },
    userTeamId: string
): { draft: DraftState; teams: Team[]; players: { [id: string]: Player }; events: Event[] } => {
    let d = draft;
    let t = teams;
    let pl = players;
    const events: Event[] = [];
    while (!d.complete && d.order[d.picks.length].teamId !== userTeamId) {
        const choice = cpuChoose(t.find(tm => tm.id === d.order[d.picks.length].teamId)!, d, pl);
        const res = applyPick(d, t, pl, choice);
        d = res.draft;
        t = res.teams;
        pl = res.players;
        events.push(res.event);
    }
    return { draft: d, teams: t, players: pl, events };
};

// Applies the user's pick, then auto-advances CPU picks up to their next turn
// (or the end of the draft).
export const makeUserPick = (
    draft: DraftState,
    teams: Team[],
    players: { [id: string]: Player },
    userTeamId: string,
    playerId: string
): { draft: DraftState; teams: Team[]; players: { [id: string]: Player }; events: Event[] } => {
    const first = applyPick(draft, teams, players, playerId);
    const rest = advanceDraftToUser(first.draft, first.teams, first.players, userTeamId);
    return { draft: rest.draft, teams: rest.teams, players: rest.players, events: [first.event, ...rest.events] };
};
