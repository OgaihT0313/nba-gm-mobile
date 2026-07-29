
import type { Player, Team, OffseasonMove, PlayerAttributes, DraftPickAsset, Coach } from './types';
import rawPlayersData from './data/players.json';
import rawTeamsData from './data/teams.json';
import rawOffseasonMoves from './data/offseason_moves.json';

// --- ASSETS AND CONFIGURATION ---
// Non-base64 (percent-encoded) data URIs decode fine in a browser, but Android's
// native image pipeline (Glide, under expo-image) rejects them outright — logs
// `IllegalArgumentException: bad base-64` and renders nothing. Confirmed live on
// device: every draft prospect avatar (no real photo → falls back to this
// placeholder) showed as a blank circle. Must stay base64-encoded.
export const PLAYER_PLACEHOLDER_SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCcgZmlsbD0nIzRBNTU2OCc+PHBhdGggZD0nTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eicvPjwvc3ZnPg==";

export const POSITIONS: { [key: string]: string } = {
    'PG': 'Armador',
    'SG': 'Ala-armador',
    'SF': 'Ala',
    'PF': 'Ala-pivô',
    'C': 'Pivô',
};

// The five starting slots, in court order — the single source of truth for the
// lineup slots (simulationService), the court layout (StartersCourt), the
// roster-hole checks (free agency / advisor) and generated draft prospects.
export const LINEUP_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// All slots a player is eligible for (falls back to the single `pos` for
// older data that predates the `positions` field).
export const getPlayerPositions = (p: Player): string[] =>
    p.positions && p.positions.length > 0 ? p.positions : [p.pos];

// Short badge form, e.g. "PF/C" for a player nba_api lists as a combo — falls
// back to the single `pos` for older data that predates the `positions` field.
export const formatPositions = (p: Player): string =>
    p.positions && p.positions.length > 1 ? p.positions.join('/') : p.pos;

// Full-name form for descriptive text, e.g. "Power Forward / Center".
export const formatPositionsFull = (p: Player): string =>
    p.positions && p.positions.length > 1
        ? p.positions.map(pos => POSITIONS[pos] || pos).join(' / ')
        : (POSITIONS[p.pos] || p.pos);

// Attribute breakdown display metadata. Ordered offense-first, then defense,
// then physical — the order the player card renders them in.
export const ATTRIBUTE_META: { key: keyof PlayerAttributes; label: string; group: 'off' | 'def' | 'phys' }[] = [
    { key: 'shooting', label: 'Arremesso', group: 'off' },
    { key: 'finishing', label: 'Finalização', group: 'off' },
    { key: 'playmaking', label: 'Armação', group: 'off' },
    { key: 'perimeterD', label: 'Def. Perímetro', group: 'def' },
    { key: 'interiorD', label: 'Def. Interior', group: 'def' },
    { key: 'rebounding', label: 'Rebote', group: 'def' },
    { key: 'athleticism', label: 'Atletismo', group: 'phys' },
];

// Safe accessor: real data always ships `attributes`, but saves/players that
// predate the attribute rebuild don't have them — synthesize a reasonable
// breakdown from off/def/ovr so the UI and sim never hit undefined.
export const getPlayerAttributes = (p: Player): PlayerAttributes =>
    p.attributes ?? {
        shooting: p.off,
        finishing: p.off,
        playmaking: p.off,
        perimeterD: p.def,
        interiorD: p.def,
        rebounding: p.def,
        athleticism: Math.round((p.off + p.def) / 2),
    };

// Green (strong) → slate (average) → red (weak) tint for an attribute value,
// so the breakdown reads at a glance. Tuned to the 60-99 rating band.
export const attributeColor = (value: number): string => {
    if (value >= 88) return '#22c55e';
    if (value >= 80) return '#4ade80';
    if (value >= 73) return '#a3a3a3';
    if (value >= 66) return '#fbbf24';
    return '#f87171';
};

// 2025-26 real NBA salary cap. Player salaries themselves are a synthetic
// model (see pipeline/salary_model.py) since the NBA doesn't expose real
// contract data via any public API — but the cap figure is real.
export const SALARY_CAP = 154_647_000;

// --- HELPER FUNCTIONS ---
export const getPlayerImageUrl = (p?: Player) => {
    if (p?.photoUrl) return p.photoUrl;
    if (p?.espnId) {
        return `https://a.espncdn.com/i/headshots/nba/players/full/${p.espnId}.png`;
    }
    return PLAYER_PLACEHOLDER_SVG;
};
export const getTeamLogoUrl = (t?: Team) => t?.logoUrl || 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';

// team.id is already a standard 3-letter tricode (okc, bos, gsw...) — reused as
// a compact label anywhere a full team.name would get clipped (bracket columns,
// tight rows), same convention broadcasts/ESPN use for the same reason.
export const getTeamTricode = (t?: Team) => (t?.id ?? '???').toUpperCase();

export const getTeamSalary = (team: Team, players: { [key: string]: Player }) =>
    team.roster.reduce((total, pId) => total + (players[pId]?.salary || 0), 0);

// Draft picks a team holds. Optional on Team (data/teams.json predates them), so
// every read goes through here rather than repeating the ?? [] everywhere.
export const picksOf = (team: Team): DraftPickAsset[] => team.picks ?? [];

// The team's functional coach. Coaches live in SeasonState.coaches, not on
// Team itself (see Team.coachId) — same indirection as players, so every read
// site takes the map explicitly instead of assuming it's populated.
export const coachOf = (team: Team, coaches: { [key: string]: Coach }): Coach | undefined =>
    team.coachId ? coaches[team.coachId] : undefined;

// Real, stable franchise brand colors (primary/secondary) — unlike rosters,
// these don't go stale, so they're safe to hardcode instead of pulling from
// an API. Used to theme the app once a GM picks their team (see App.tsx).
export const TEAM_COLORS: { [key: string]: { primary: string; secondary: string } } = {
    atl: { primary: '#E03A3E', secondary: '#C1D32F' },
    bkn: { primary: '#000000', secondary: '#707271' },
    bos: { primary: '#007A33', secondary: '#BA9653' },
    cha: { primary: '#1D1160', secondary: '#00788C' },
    chi: { primary: '#CE1141', secondary: '#000000' },
    cle: { primary: '#860038', secondary: '#FDBB30' },
    dal: { primary: '#00538C', secondary: '#B8C4CA' },
    den: { primary: '#0E2240', secondary: '#FEC524' },
    det: { primary: '#C8102E', secondary: '#1D42BA' },
    gsw: { primary: '#1D428A', secondary: '#FFC72C' },
    hou: { primary: '#CE1141', secondary: '#000000' },
    ind: { primary: '#002D62', secondary: '#FDBB30' },
    lac: { primary: '#C8102E', secondary: '#1D428A' },
    lal: { primary: '#552583', secondary: '#FDB927' },
    mem: { primary: '#5D76A9', secondary: '#F5B112' },
    mia: { primary: '#98002E', secondary: '#F9A01B' },
    mil: { primary: '#00471B', secondary: '#EEE1C6' },
    min: { primary: '#0C2340', secondary: '#78BE20' },
    nop: { primary: '#0C2340', secondary: '#C8102E' },
    nyk: { primary: '#006BB6', secondary: '#F58426' },
    okc: { primary: '#007AC1', secondary: '#EF3B24' },
    orl: { primary: '#0077C0', secondary: '#C4CED4' },
    phi: { primary: '#006BB6', secondary: '#ED174C' },
    phx: { primary: '#1D1160', secondary: '#E56020' },
    por: { primary: '#E03A3E', secondary: '#000000' },
    sac: { primary: '#5A2D81', secondary: '#63727A' },
    sas: { primary: '#C4CED4', secondary: '#000000' },
    tor: { primary: '#CE1141', secondary: '#A1A1A4' },
    uta: { primary: '#002B5C', secondary: '#F9A01B' },
    was: { primary: '#002B5C', secondary: '#E31837' },
};

const DEFAULT_ACCENT = { primary: '#0ea5e9', secondary: '#0284c7' };

export const getTeamAccent = (teamId?: string | null) =>
    (teamId && TEAM_COLORS[teamId]) || DEFAULT_ACCENT;

// Real all-time NBA championship counts per current franchise, through the
// 2026 Finals (Knicks) — a fixed historical fact like TEAM_COLORS, not
// something the data pipeline needs to track. Franchise lineage is folded
// into its current home (e.g. Seattle SuperSonics' 1979 title counts for
// `okc`, Rochester Royals' 1951 title counts for `sac`).
export const TEAM_TITLES: { [key: string]: number } = {
    atl: 1, bkn: 0, bos: 18, cha: 0, chi: 6, cle: 1, dal: 1, den: 1, det: 3,
    gsw: 7, hou: 2, ind: 0, lac: 0, lal: 17, mem: 0, mia: 3, mil: 2, min: 0,
    nop: 0, nyk: 3, okc: 2, orl: 0, phi: 3, phx: 0, por: 1, sac: 1, sas: 5,
    tor: 1, uta: 0, was: 1,
};

export const getTeamTitles = (teamId?: string | null) => (teamId && TEAM_TITLES[teamId]) || 0;

// Darkens a hex color for hover/pressed states, so we don't need a hand-picked
// third shade per franchise on top of primary/secondary.
export const darkenHex = (hex: string, factor = 0.7) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

// --- DATA ---
// Real rosters, ratings and derived salaries generated from live NBA stats
// via pipeline/fetch_data.py (nba_api) — see that script to regenerate.
export const playersData: { [key: string]: Player } = rawPlayersData as { [key: string]: Player };
export const teamsData: Team[] = rawTeamsData as unknown as Team[];

// Real trades/free-agency signings that happened between fromSeason and
// toSeason, diffed from live nba_api rosters — see fetch_offseason_moves in
// pipeline/fetch_data.py. Replayed once as events when starting a new season.
export const offseasonMoves: { fromSeason: string; toSeason: string; moves: OffseasonMove[] } = rawOffseasonMoves;
