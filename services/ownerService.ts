import { Team, Player, OwnerMandate, OwnerExpectation } from '../types';

type PlayerMap = { [key: string]: Player };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Average OVR of a team's top 8 — the same "roster strength" read the free
// agency service uses to judge how competitive a roster is. Used here to rank
// the user's team against the league so the owner's mandate is proportional to
// the talent they were handed.
const top8Avg = (team: Team, players: PlayerMap): number => {
    const ovrs = team.roster.map(id => players[id]?.ovr || 0).sort((a, b) => b - a).slice(0, 8);
    return ovrs.length ? ovrs.reduce((a, b) => a + b, 0) / ovrs.length : 70;
};

// Human-readable label + a one-line description of what the owner wants, keyed
// by mandate. The description doubles as the owner's opening note for the season.
export const MANDATE_META: Record<OwnerMandate, { label: string; blurb: string }> = {
    championship: { label: 'Título ou nada', blurb: 'Este elenco foi montado para vencer agora. O dono espera o troféu.' },
    contender: { label: 'Brigar pelo título', blurb: 'Um dos melhores elencos da liga — o dono quer uma campanha de contender e uma boa arrancada nos playoffs.' },
    playoffs: { label: 'Chegar aos playoffs', blurb: 'O dono espera classificação para os playoffs. Nada de temporada perdida.' },
    develop: { label: 'Mostrar evolução', blurb: 'Time em ascensão. O dono quer ver progresso e uma disputa pelo play-in.' },
    rebuild: { label: 'Reconstrução', blurb: 'Ano de reconstrução. O dono cobra desenvolvimento, não vitórias — paciência com os resultados.' },
};

// Derive the owner's mandate + regular-season win target from where the team's
// roster strength ranks in the league at season start. A stacked roster gets a
// title mandate and a high bar; a bottom-five roster gets a forgiving rebuild
// mandate. Recomputed every season start so it tracks roster moves.
export const deriveMandate = (
    team: Team,
    teams: Team[],
    players: PlayerMap
): { mandate: OwnerMandate; targetWins: number } => {
    const myStrength = top8Avg(team, players);
    // 0 = strongest in the league, 29 = weakest.
    const rank = teams.filter(t => t.id !== team.id && top8Avg(t, players) > myStrength).length;
    if (rank <= 2) return { mandate: 'championship', targetWins: 54 };
    if (rank <= 7) return { mandate: 'contender', targetWins: 48 };
    if (rank <= 14) return { mandate: 'playoffs', targetWins: 42 };
    if (rank <= 21) return { mandate: 'develop', targetWins: 34 };
    return { mandate: 'rebuild', targetWins: 25 };
};

// The three job-security zones, derived from the confidence number. Drives the
// color coding and the "hot seat" warnings.
export type ConfidenceZone = 'safe' | 'warm' | 'hot';
export const confidenceZone = (confidence: number): ConfidenceZone =>
    confidence >= 55 ? 'safe' : confidence >= 25 ? 'warm' : 'hot';

export const ZONE_META: Record<ConfidenceZone, { label: string; tone: 'positive' | 'warning' | 'danger' }> = {
    safe: { label: 'Estável', tone: 'positive' },
    warm: { label: 'Pressionado', tone: 'warning' },
    hot: { label: 'Beira da demissão', tone: 'danger' },
};

// In-season confidence: project the team's current win pace out to 82 games and
// score it against the owner's target. Deterministic (a pure function of the
// current record), so it self-corrects as the season plays out instead of
// drifting — a hot streak lifts it, a slump drops it, and it converges on the
// real season result. Held steady for the first few games, where a tiny sample
// projects wildly (a 1-0 start isn't a 82-win pace the owner believes).
export const projectConfidence = (owner: OwnerExpectation, team: Team): number => {
    const wins = team.wins || 0;
    const losses = team.losses || 0;
    const gp = wins + losses;
    if (gp < 5) return owner.confidence;
    const projWins = (wins / gp) * 82;
    // Each win above/below the target is worth ~2.2 points, centered at 60 so a
    // team exactly on target sits comfortably clear of the danger zone.
    return clamp(Math.round(60 + (projWins - owner.targetWins) * 2.2), 0, 100);
};

// Whether the owner fires the user mid-season. Deliberately unforgiving to
// trigger: only once the season is at least half over AND confidence has
// bottomed out — a genuine collapse of a team that was expected to win, not a
// cold week. A rebuild mandate has such a low target that confidence never
// craters from losing, so those GMs are effectively safe (as they should be).
export const shouldFireMidSeason = (owner: OwnerExpectation, gamesPlayed: number): boolean =>
    gamesPlayed >= 41 && owner.confidence <= 5;

// End-of-season judgment, run when a champion is crowned. Folds the playoff
// outcome into the final confidence and decides whether the owner keeps the GM.
// Winning it all is always a save; missing the playoffs under a win-now mandate
// is what gets a GM fired.
export const evaluateSeasonOutcome = (
    owner: OwnerExpectation,
    team: Team,
    madePlayoffs: boolean,
    wonTitle: boolean
): { confidence: number; fired: boolean; message: string } => {
    const wins = team.wins || 0;
    let c = clamp(Math.round(60 + (wins - owner.targetWins) * 2.2), 0, 100);
    if (wonTitle) c = 100;
    else if (madePlayoffs) c = clamp(c + 12, 0, 100);
    else c = clamp(c - 15, 0, 100);

    // Mandate-specific firing lines: a title-or-nothing owner is far quicker to
    // pull the trigger than one who asked for a rebuild.
    const fireLine =
        owner.mandate === 'championship' ? 30 :
        owner.mandate === 'contender' ? 24 :
        owner.mandate === 'playoffs' ? 18 :
        owner.mandate === 'develop' ? 12 : 6;
    const fired = c < fireLine && !wonTitle;

    let message: string;
    if (wonTitle) {
        message = `Você trouxe o título para o ${team.name}. O dono te dá carta branca — sua vaga está garantida.`;
    } else if (fired) {
        message = `Temporada de ${wins} vitórias, abaixo da meta de ${owner.targetWins}. O dono decidiu buscar um novo GM. Você está demitido.`;
    } else if (madePlayoffs && wins >= owner.targetWins) {
        message = `Meta cumprida: ${wins} vitórias e vaga nos playoffs. O dono está satisfeito com o rumo do ${team.name}.`;
    } else if (madePlayoffs) {
        message = `${wins} vitórias e uma vaga nos playoffs seguram a barra, mesmo abaixo da meta de ${owner.targetWins}. O dono quer mais no ano que vem.`;
    } else {
        message = `${wins} vitórias e nenhuma vaga nos playoffs. O dono está descontente — a cadeira esquentou para a próxima temporada.`;
    }

    return { confidence: c, fired, message };
};

// Build the fresh owner expectation for a season start, re-deriving the mandate
// from the (now final) roster and carrying confidence forward from last season
// — a GM who barely survived starts on thin ice; one coming off a title starts
// comfortable. `prior` is undefined for a brand-new save (defaults to 60).
export const buildSeasonOwner = (
    team: Team,
    teams: Team[],
    players: PlayerMap,
    prior?: OwnerExpectation
): OwnerExpectation => {
    const { mandate, targetWins } = deriveMandate(team, teams, players);
    return {
        mandate,
        targetWins,
        confidence: prior ? prior.confidence : 60,
        fired: false,
        note: MANDATE_META[mandate].blurb,
    };
};
