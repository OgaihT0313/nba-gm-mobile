// Headlines: the front page of the season, derived from state every time it is
// read. The last piece of the press/storyline layer.
//
// A headline is never a new mechanic on its own. Each one is the visible face
// of a story the simulation already acts on -- a milestone (morale, and a
// veteran putting off retirement), the MVP race (the award reads the same
// mvpScore), the owner's patience (the job), a public promise (the end-of-
// season verdict), a hot run (momentum). That is the bar the roadmap set for
// the press: nothing here is flavour text about something that does nothing.
//
// Derived, not stored, and never pushed through `season.events` (50 slots, 6
// rendered, buried by any offseason). Nothing to keep in sync, nothing lost on
// load.

import type { Player, SeasonState, Team } from '../types';
import { formatMark, approaching, MILESTONES } from './milestoneService';
import { mvpScore } from './simulationService';
import { currentStreak } from './formService';
import { sortStandings } from './scheduleService';
import { confidenceZone } from './ownerService';
import { PROMISE_LABEL } from './pressService';

export interface Headline {
    id: string;
    kicker: string;
    title: string;
    sub?: string;
    tone: 'good' | 'warn' | 'bad' | 'info';
    /** Ranking only: bigger leads the page. */
    weight: number;
}

/** How recent a reached milestone stays news. */
const MILESTONE_NEWS_DAYS = 7;
/** "About to": within this many games at his current pace. */
const APPROACH_GAMES = 5;
const MVP_RACE_FROM = 15;
const HOT_STREAK_NEWS = 7;
const PROMISE_WATCH_FROM = 55;
/** Seeds that skip the play-in: what "made the playoffs" means for a promise. */
const DIRECT_SEEDS = 6;
export const MAX_HEADLINES = 4;

const nick = (t: Team | undefined) => (t ? t.name.split(' ').slice(-1)[0] : 'sem time');

export const headlines = (season: SeasonState): Headline[] => {
    if (season.status !== 'active') return [];
    const out: Headline[] = [];
    const gp = season.gamesPlayed;
    const teamOf = new Map<string, Team>();
    season.teams.forEach(t => t.roster.forEach(id => teamOf.set(id, t)));
    const user = season.teams.find(t => t.id === season.userTeamId);
    const mine = (id: string) => teamOf.get(id)?.id === season.userTeamId;

    // --- Milestones reached ------------------------------------------------
    // The front page is for the big marks (20,000 points, 10,000 rebounds...)
    // and for yours; a role player's 5,000th point is real but not news, and
    // with real careers seeded the league crosses dozens of those a season.
    const newsworthy = (stat: keyof typeof MILESTONES, value: number, playerId: string) =>
        value >= MILESTONES[stat].big || mine(playerId);
    (season.milestones ?? [])
        .filter(m => gp - m.day < MILESTONE_NEWS_DAYS && newsworthy(m.stat, m.value, m.playerId))
        .forEach(m => {
            const big = m.value >= MILESTONES[m.stat].big;
            out.push({
                id: `ms:${m.playerId}:${m.stat}:${m.value}`,
                kicker: 'Marco de carreira',
                title: `${m.name} chega a ${formatMark(m.stat, m.value)}`,
                sub: `${nick(season.teams.find(t => t.id === m.teamId))} · dia ${m.day}`,
                tone: 'good',
                weight: 70 + (big ? 15 : 0) + (mine(m.playerId) ? 10 : 0) - (gp - m.day),
            });
        });

    // --- Milestones about to fall -----------------------------------------
    // One per player, the biggest he is near; the two most significant make
    // the page.
    const near = season.teams.flatMap(t => t.roster.map(id => season.players[id]))
        .map(p => ({ p, a: p ? approaching(p, APPROACH_GAMES) : undefined }))
        .filter((x): x is { p: Player; a: NonNullable<ReturnType<typeof approaching>> } => !!x.a && newsworthy(x.a.stat, x.a.mark, x.p.id))
        .sort((x, y) => y.a.mark / MILESTONES[y.a.stat].big - x.a.mark / MILESTONES[x.a.stat].big)
        .slice(0, 2);
    near.forEach(({ p, a }) => {
        out.push({
            id: `near:${p.id}:${a.stat}`,
            kicker: 'Perto do marco',
            title: `${p.name} está a ${a.gap.toLocaleString('pt-BR')} ${MILESTONES[a.stat].label} dos ${a.mark.toLocaleString('pt-BR')}`,
            sub: nick(teamOf.get(p.id)),
            tone: 'info',
            weight: 45 + (a.mark >= MILESTONES[a.stat].big ? 10 : 0) + (mine(p.id) ? 15 : 0),
        });
    });

    // --- The MVP race -----------------------------------------------------
    if (gp >= MVP_RACE_FROM) {
        const race = Object.values(season.players)
            .filter(p => teamOf.has(p.id) && (p.seasonStats?.gp ?? 0) >= gp * 0.5)
            .map(p => ({ p, score: mvpScore(p, teamOf.get(p.id)!) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 2);
        if (race.length === 2) {
            const [a, b] = race;
            const s = a.p.seasonStats!;
            out.push({
                id: `mvp:${a.p.id}`,
                kicker: 'Corrida ao MVP',
                title: `${a.p.name} lidera a corrida`,
                sub: `${s.ppg.toFixed(1)} pts, ${s.rpg.toFixed(1)} reb, ${s.apg.toFixed(1)} ast · à frente de ${b.p.name}`,
                tone: 'info',
                weight: 40 + (mine(a.p.id) || mine(b.p.id) ? 20 : 0),
            });
        }
    }

    // --- The longest run in the league --------------------------------------
    const hot = season.teams
        .map(t => ({ t, run: currentStreak(season.schedule, t.id) }))
        .filter(x => Math.abs(x.run) >= HOT_STREAK_NEWS)
        .sort((a, b) => Math.abs(b.run) - Math.abs(a.run))[0];
    if (hot) {
        const wins = hot.run > 0;
        out.push({
            id: `streak:${hot.t.id}:${hot.run}`,
            kicker: wins ? 'Embalado' : 'Em queda livre',
            title: `${hot.t.name}: ${Math.abs(hot.run)} ${wins ? 'vitórias' : 'derrotas'} seguidas`,
            sub: `${hot.t.wins}-${hot.t.losses}`,
            tone: wins ? 'good' : 'bad',
            weight: 30 + Math.abs(hot.run) + (hot.t.id === season.userTeamId ? 20 : 0),
        });
    }

    // --- Your job -----------------------------------------------------------
    if (user && !season.owner.fired && confidenceZone(season.owner.confidence) === 'hot') {
        out.push({
            id: 'hotseat',
            kicker: 'Diretoria',
            title: `Cadeira quente no ${user.name}`,
            sub: `A confiança do dono está em ${season.owner.confidence}%. Abaixo de 5% depois da metade da temporada, ele demite.`,
            tone: 'bad',
            weight: 75,
        });
    }

    // --- Your promise -------------------------------------------------------
    const promise = season.owner.press?.promise;
    if (user && promise?.kind === 'playoffs' && gp >= PROMISE_WATCH_FROM) {
        const conf = sortStandings(season.teams.filter(t => t.conference === user.conference), season.schedule);
        const rank = conf.findIndex(t => t.id === user.id) + 1;
        const safe = rank <= DIRECT_SEEDS;
        out.push({
            id: `promise:${rank}`,
            kicker: 'Promessa',
            title: safe
                ? `${user.name} no caminho da promessa`
                : `Promessa em risco: ${user.name} é o ${rank}º`,
            sub: `Você prometeu ${PROMISE_LABEL[promise.kind]} na coletiva do dia ${promise.day}. Faltam ${82 - gp} jogos.`,
            tone: safe ? 'good' : 'warn',
            weight: safe ? 30 : 65,
        });
    }

    return out.sort((a, b) => b.weight - a.weight).slice(0, MAX_HEADLINES);
};
