import type { Player, Team, TradeOffer, DraftPickAsset } from '../types';
import { SALARY_CAP, getTeamSalary, getPlayerPositions } from '../constants';
import { projectedPickSlot } from './draftService';

export const MIN_ROSTER_SIZE = 8;
// 15 standard contracts + up to 3 two-way slots, matching what
// commonteamroster actually returns for a full NBA roster.
export const MAX_ROSTER_SIZE = 18;

// Real NBA trade deadline, mapped onto the compressed 82-game calendar —
// roughly where the season's real deadline falls (early-mid February),
// right after the elevated CPU-trade-frenzy window in
// simulationService.ts's handleRandomEvents. No trades (user or CPU) happen
// after this point until the next season.
export const TRADE_DEADLINE_GAME = 55;

export interface TradeLegalityResult {
    legal: boolean;
    reason?: string;
}

const assetsSalary = (assetIds: string[], players: { [key: string]: Player }) =>
    assetIds.reduce((total, pId) => total + (players[pId]?.salary || 0), 0);

// Simplified version of the NBA's real salary-matching rule: teams already
// over the cap can only take back up to 125% + $100k of what they send out;
// teams under the cap can absorb freely as long as they don't blow past it.
const checkSalaryMatch = (team: Team, outgoingSalary: number, incomingSalary: number, players: { [key: string]: Player }): TradeLegalityResult => {
    const currentSalary = getTeamSalary(team, players);
    const isOverCap = currentSalary > SALARY_CAP;

    if (isOverCap) {
        const maxIncoming = outgoingSalary * 1.25 + 100_000;
        if (incomingSalary > maxIncoming) {
            return {
                legal: false,
                reason: `${team.name} está acima do teto salarial e não pode receber mais do que 125% + $100k do que envia (enviando $${(outgoingSalary / 1_000_000).toFixed(1)}M, recebendo $${(incomingSalary / 1_000_000).toFixed(1)}M).`,
            };
        }
        return { legal: true };
    }

    const salaryAfterTrade = currentSalary - outgoingSalary + incomingSalary;
    if (salaryAfterTrade > SALARY_CAP) {
        return {
            legal: false,
            reason: `Essa troca deixaria o ${team.name} acima do teto salarial ($${(salaryAfterTrade / 1_000_000).toFixed(1)}M vs teto de $${(SALARY_CAP / 1_000_000).toFixed(1)}M).`,
        };
    }
    return { legal: true };
};

// `pickCountA/B` only widen what counts as "something on the table": picks carry
// no salary and take no roster spot, so they're invisible to every other rule
// here — a pick-for-player deal is perfectly legal.
export const evaluateTradeLegality = (
    teamA: Team,
    assetsA: string[],
    teamB: Team,
    assetsB: string[],
    players: { [key: string]: Player },
    gamesPlayed: number,
    pickCountA = 0,
    pickCountB = 0
): TradeLegalityResult => {
    if (gamesPlayed >= TRADE_DEADLINE_GAME) {
        return { legal: false, reason: 'O prazo de trocas da temporada já passou. Volte na próxima temporada.' };
    }

    if (assetsA.length + pickCountA === 0 || assetsB.length + pickCountB === 0) {
        return { legal: false, reason: 'Coloque pelo menos um jogador ou pick de cada lado.' };
    }

    const rosterASizeAfter = teamA.roster.length - assetsA.length + assetsB.length;
    const rosterBSizeAfter = teamB.roster.length - assetsB.length + assetsA.length;

    if (rosterASizeAfter < MIN_ROSTER_SIZE || rosterASizeAfter > MAX_ROSTER_SIZE) {
        return { legal: false, reason: `${teamA.name} ficaria com ${rosterASizeAfter} jogadores (limite: ${MIN_ROSTER_SIZE}-${MAX_ROSTER_SIZE}).` };
    }
    if (rosterBSizeAfter < MIN_ROSTER_SIZE || rosterBSizeAfter > MAX_ROSTER_SIZE) {
        return { legal: false, reason: `${teamB.name} ficaria com ${rosterBSizeAfter} jogadores (limite: ${MIN_ROSTER_SIZE}-${MAX_ROSTER_SIZE}).` };
    }

    const salaryA = assetsSalary(assetsA, players);
    const salaryB = assetsSalary(assetsB, players);

    const matchA = checkSalaryMatch(teamA, salaryA, salaryB, players);
    if (!matchA.legal) return matchA;

    const matchB = checkSalaryMatch(teamB, salaryB, salaryA, players);
    if (!matchB.legal) return matchB;

    return { legal: true };
};

export interface TradeValueEvaluation {
    accepted: boolean;
    receivesValue: number;
    givesValue: number;
    fairnessRatio: number;
}

// Real GMs weigh young talent above what a raw rating implies (upside,
// team-building value, longer control) and discount aging players (shorter
// remaining window).
const ageFactor = (age: number) => {
    if (age <= 23) return 1.15;
    if (age <= 29) return 1.0;
    if (age <= 33) return 0.9;
    return 0.75;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Mirrors pipeline/salary_model.py so we can judge whether a player's *current*
// salary is fair for their *current* OVR/age. Salaries are frozen at data-gen
// time and never re-negotiated, but OVR drifts every offseason via
// progression — so a declined veteran ends up overpaid and a young breakout
// ends up on a bargain deal. That gap is what makes a contract a real asset or
// liability, not just a cap-matching number.
const MIN_SALARY = 1_157_153;
const SALARY_OVR_CURVE: [number, number][] = [
    [60, 0.010], [65, 0.018], [70, 0.035], [75, 0.065], [80, 0.115],
    [85, 0.190], [90, 0.280], [95, 0.360], [99, 0.40],
];
const salaryAgeFactor = (age: number) => {
    if (age <= 22) return 0.55;
    if (age <= 25) return 0.80;
    if (age <= 30) return 1.0;
    if (age <= 34) return 0.85;
    return 0.65;
};
const capFractionForOvr = (ovr: number): number => {
    if (ovr <= SALARY_OVR_CURVE[0][0]) return SALARY_OVR_CURVE[0][1];
    if (ovr >= SALARY_OVR_CURVE[SALARY_OVR_CURVE.length - 1][0]) return SALARY_OVR_CURVE[SALARY_OVR_CURVE.length - 1][1];
    for (let i = 0; i < SALARY_OVR_CURVE.length - 1; i++) {
        const [ovrLo, fracLo] = SALARY_OVR_CURVE[i];
        const [ovrHi, fracHi] = SALARY_OVR_CURVE[i + 1];
        if (ovr >= ovrLo && ovr <= ovrHi) {
            const t = (ovr - ovrLo) / (ovrHi - ovrLo);
            return fracLo + t * (fracHi - fracLo);
        }
    }
    return SALARY_OVR_CURVE[SALARY_OVR_CURVE.length - 1][1];
};
export const expectedSalary = (ovr: number, age: number): number =>
    clamp(SALARY_CAP * capFractionForOvr(ovr) * salaryAgeFactor(age), MIN_SALARY, SALARY_CAP * 0.40);

// Contract as a tradeable asset. Two levers on top of raw OVR/age:
//  • efficiency — underpaid vs. their fair salary is surplus value a GM covets;
//    overpaid is a liability that makes a player harder to move.
//  • control — years left on a genuinely useful player is an asset (you keep
//    them); long money owed to an aging fringe player is a mild negative.
// Bounded so a great bargain or a bad contract shades value without ever
// overriding the player's actual talent.
export const contractFactor = (p: Player): number => {
    const expected = expectedSalary(p.ovr, p.age);
    const ratio = expected > 0 ? p.salary / expected : 1;
    const efficiency = 1 + (1 - ratio) * 0.22;
    let control = 1;
    if (p.contractYears > 0 && p.ovr >= 76) control = 1 + (p.contractYears - 2) * (p.age <= 29 ? 0.03 : 0.012);
    else if (p.age >= 32 && p.contractYears >= 3) control = 0.95;
    return clamp(efficiency * control, 0.80, 1.20);
};

// A player's trade value = talent (OVR × age) shaded by how good/bad their
// contract is. Used by the CPU accept/reject logic, the free-agent market
// ordering, and the CPU trade-offer builder.
export const playerValue = (p: Player) => p.ovr * ageFactor(p.age) * contractFactor(p);

const assetsValue = (assetIds: string[], players: { [key: string]: Player }) =>
    assetIds.reduce((total, pId) => total + (players[pId] ? playerValue(players[pId]) : 0), 0);

// --- DRAFT PICKS AS TRADE CURRENCY -----------------------------------------
// A pick has to be priced in the SAME currency as playerValue, or the two can't
// sit on opposite sides of one trade. Three things separate a pick from the
// player it becomes:
//   • which slot it'll be — projected from the original team's record today;
//   • when it pays — a pick three drafts out helps a different roster;
//   • that it's a ticket, not a player — the fog of Fase B is real risk.

// Expected rating at a slot, mirroring projectedOvr/projectedPotential in
// draftService (76 at the top, tapering half a point per slot, with the upside
// bonus the CPU already pays for on the draft board).
const expectedProspectValue = (slot: number): number => {
    const ovr = 76 - slot * 0.5;
    const upside = slot < 5 ? 6 : slot < 14 ? 4 : slot < 24 ? 2 : 1;
    return ovr + upside;
};

// A pick is worth less than the prospect it yields: you don't know which slot
// you're getting, the fog means you might not even get what the board says, and
// a rookie is raw. Time discount compounds on top, per draft of distance.
const PICK_RISK = 0.85;
const PICK_TIME_DISCOUNT = 0.88;

// Real pick-value curves are steeply convex — a #1 is worth several times a #30,
// not 30% more. playerValue is linear in OVR, and prospect ratings only taper
// half a point per slot, so without this a late first prices out like a rotation
// player and a pile of them buys a star. Measured: three #30-ish picks come to
// roughly half a 90-OVR player, which is the shape we want.
const slotScarcity = (slot: number) => 0.35 + 0.65 * Math.pow(Math.max(0, 1 - slot / 30), 1.6);

export const pickAssetValue = (pick: DraftPickAsset, teams: Team[], currentDraft: number): number => {
    const slot = projectedPickSlot(pick.originalTeamId, teams);
    const draftsAway = Math.max(0, pick.draft - currentDraft);
    // Protection caps the upside for whoever RECEIVES the pick — the good outcome
    // (a top-N slot) is exactly the one that doesn't convey.
    const protectionFactor = pick.protection ? Math.max(0.45, 1 - pick.protection * 0.06) : 1;
    return expectedProspectValue(slot)
        * ageFactor(20)
        * PICK_RISK
        * slotScarcity(slot)
        * Math.pow(PICK_TIME_DISCOUNT, draftsAway)
        * protectionFactor;
};

// Quantity is not quality: a GM won't hand over a star for a pile of late
// firsts, because only so many of them can turn into rotation players and roster
// spots are finite. So a package's picks are discounted steeply after the first,
// which is what stops "three late picks buy a superstar".
const PICK_STACK_WEIGHTS = [1, 0.7, 0.45, 0.3, 0.2];

export const picksValue = (picks: DraftPickAsset[], teams: Team[], currentDraft: number): number =>
    picks
        .map(p => pickAssetValue(p, teams, currentDraft))
        .sort((a, b) => b - a)
        .reduce((total, v, i) => total + v * (PICK_STACK_WEIGHTS[i] ?? 0.12), 0);

// Context a trade needs to price picks: who's in the league (for projected
// slots) and which draft is next (for the time discount).
export interface PickTradeContext {
    teams: Team[];
    currentDraft: number;
    givePicks: DraftPickAsset[];
    receivePicks: DraftPickAsset[];
}

// Decides whether `evaluatingTeam` should accept giving up `gives` in
// exchange for `receives`, purely from asset value — no LLM involved, so the
// outcome is deterministic and doesn't depend on a model's mood or on
// parsing a free-text response. Contenders (top-10 power rank) take on more
// value risk for immediate difference-makers; rebuilding teams (bottom-10)
// hold out for closer to full value since youth is already priced in via ageFactor.
export const evaluateTradeValue = (
    evaluatingTeam: Team,
    gives: string[],
    receives: string[],
    players: { [key: string]: Player },
    picks?: PickTradeContext
): TradeValueEvaluation => {
    const givesValue = assetsValue(gives, players)
        + (picks ? picksValue(picks.givePicks, picks.teams, picks.currentDraft) : 0);
    const receivesValue = assetsValue(receives, players)
        + (picks ? picksValue(picks.receivePicks, picks.teams, picks.currentDraft) : 0);
    const fairnessRatio = givesValue > 0 ? receivesValue / givesValue : 1;

    const threshold = evaluatingTeam.powerRank <= 10 ? 0.80 : evaluatingTeam.powerRank > 20 ? 0.90 : 0.85;

    return {
        accepted: fairnessRatio >= threshold,
        receivesValue,
        givesValue,
        fairnessRatio,
    };
};

// --- CPU-initiated trade offers to the user ---

const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// Best OVR a team fields at a given position (0 if nobody plays it) — used to
// spot the positions a CPU is thin at and would want to upgrade via trade.
const bestOvrAtPosition = (team: Team, players: { [key: string]: Player }, pos: string): number =>
    team.roster.reduce((best, id) => {
        const p = players[id];
        return p && getPlayerPositions(p).includes(pos) ? Math.max(best, p.ovr) : best;
    }, 0);

// Finds a package of 1-2 players from `givable` whose combined trade value lands
// within [target*lo, target*hi], preferring the smallest package. Keeps CPU
// offers close to fair (a touch in the user's favor) so they're a real decision.
const findPackage = (givable: Player[], target: number, lo: number, hi: number): Player[] | null => {
    for (const p of givable) {
        const v = playerValue(p);
        if (v >= target * lo && v <= target * hi) return [p];
    }
    for (let i = 0; i < givable.length; i++) {
        for (let j = i + 1; j < givable.length; j++) {
            const v = playerValue(givable[i]) + playerValue(givable[j]);
            if (v >= target * lo && v <= target * hi) return [givable[i], givable[j]];
        }
    }
    return null;
};

// Builds one realistic trade proposal a CPU team would send the user: a team
// that's thin at a position targets a matching user rotation player and offers
// a fair (slightly user-favorable) package of its non-core pieces in return.
// Returns null if no legal, sensible offer exists right now. Deadline-aware.
export const generateCpuTradeOffer = (
    userTeam: Team,
    allTeams: Team[],
    players: { [key: string]: Player },
    gamesPlayed: number,
    currentDraft: number,
    /**
     * Ask about THIS player specifically instead of whoever the CPU would have
     * picked. Used when the user has put a name on the market — a GM who says
     * he is listening on a player gets calls about that player, not about
     * somebody else. The usual rating filter is bypassed for him: he is on the
     * block because his own team said so, not because he fits a band.
     */
    forceTargetId?: string,
): TradeOffer | null => {
    if (gamesPlayed >= TRADE_DEADLINE_GAME) return null;

    // User players worth asking for: real rotation pieces, not fringe/end-of-bench.
    const forced = forceTargetId ? players[forceTargetId] : undefined;
    const userTargets = forced && userTeam.roster.includes(forced.id)
        ? [forced]
        : userTeam.roster
            .map(id => players[id])
            .filter((p): p is Player => !!p && p.ovr >= 74 && p.ovr <= 90)
            .sort((a, b) => playerValue(b) - playerValue(a));
    if (userTargets.length === 0) return null;

    for (const cpu of shuffle(allTeams.filter(t => t.id !== userTeam.id))) {
        // Everything outside the CPU's top 2 by OVR is on the table (they keep
        // their two best), down to a floor so they don't offer pure scrubs.
        // Keeping only the top 2 as untouchable (vs top 3) means a good user
        // player can be matched by a single comparable CPU piece, which is what
        // makes clean, believable 1-for-1 offers actually assemble.
        const givable = cpu.roster
            .map(id => players[id])
            .filter((p): p is Player => !!p)
            .sort((a, b) => b.ovr - a.ovr)
            .slice(2)
            .filter(p => p.ovr >= 68);
        if (givable.length === 0) continue;

        const wantsPlayer = (target: Player) => {
            const pos = getPlayerPositions(target);
            const cpuBestAtPos = Math.max(...pos.map(p => bestOvrAtPosition(cpu, players, p)));
            // Would the player meaningfully help their rotation at that position
            // — i.e. not clearly worse than what they already have. (Loose on
            // purpose: a CPU covets a solid rotation piece for depth, not only a
            // strict upgrade over their current starter.)
            return target.ovr >= cpuBestAtPos - 6;
        };

        // Cheapest-first: a GM closes a gap with the least valuable pick that
        // does the job, and never trades a pick it doesn't own outright.
        const ownPicks = (cpu.picks ?? [])
            .filter(p => p.originalTeamId === cpu.id)
            .map(p => ({ pick: p, value: pickAssetValue(p, allTeams, currentDraft) }))
            .sort((a, b) => a.value - b.value);

        for (const target of userTargets.slice(0, 4)) {
            if (!wantsPlayer(target)) continue;
            const targetValue = playerValue(target);

            // Wide enough that a single comparable player OR a two-piece package
            // can land near the target's value; the range still keeps offers
            // roughly fair (a touch in the user's favor on the pair side).
            const pkg = findPackage(givable, targetValue, 0.85, 1.45);
            if (pkg) {
                const offerIds = pkg.map(p => p.id);
                if (evaluateTradeLegality(cpu, offerIds, userTeam, [target.id], players, gamesPlayed).legal) {
                    return {
                        id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        fromTeamId: cpu.id,
                        requestIds: [target.id],
                        offerIds,
                    };
                }
            }

            // Bodies don't quite cover the asking price — throw in a pick. This
            // "player plus a first" shape is the only one that survives salary
            // matching, and that constraint is the whole reason it has to be
            // built this way round: a pick carries NO salary, so an offer where
            // the pick does the heavy lifting can't legally absorb a well-paid
            // veteran. The player package has to stand on its own for the money;
            // the pick only closes the value gap. (Measured: pick-led offers
            // assembled 0 times in 300 attempts before this rewrite.)
            const short = findPackage(givable, targetValue, 0.5, 0.85);
            if (!short) continue;
            const shortValue = short.reduce((s, p) => s + playerValue(p), 0);
            const sweetener = ownPicks.find(({ value }) => {
                const total = shortValue + value;
                return total >= targetValue * 0.85 && total <= targetValue * 1.45;
            });
            if (!sweetener) continue;
            const offerIds = short.map(p => p.id);
            if (!evaluateTradeLegality(cpu, offerIds, userTeam, [target.id], players, gamesPlayed, 1, 0).legal) continue;
            return {
                id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                fromTeamId: cpu.id,
                requestIds: [target.id],
                offerIds,
                offerPickIds: [sweetener.pick.id],
            };
        }
    }
    return null;
};
