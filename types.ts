
// 2K-style attribute breakdown, all on the same 60-99 scale as ovr/off/def.
// Derived from real nba_api box-score/advanced/hustle/tracking-defense stats
// (see pipeline/fetch_data.py). off is a roll-up of the offensive three and
// def of the defensive three, so the headline numbers stay coherent with the
// breakdown. The match sim reads these too (see simulationService.ts).
export interface PlayerAttributes {
  shooting: number;    // Arremesso — perimeter/3PT + FT touch + eFG
  finishing: number;   // Finalização — paint scoring, FG%, rim pressure
  playmaking: number;  // Armação — assist rate, AST/TO, raw assists
  perimeterD: number;  // Defesa de Perímetro — steals, deflections, opp FG% impact
  interiorD: number;   // Defesa Interior — blocks, contested 2s, rim protection
  rebounding: number;  // Rebote — rebound %, def/off boards
  athleticism: number; // Atletismo — fast-break, rim pressure, steals+blocks, age
}

// Accumulated per-game averages for the current regular season, built up by
// the match sim (recordGameStats in simulationService.ts) distributing each
// game's team box score across the rotation. Undefined until the player has
// logged a game; reset at the start of every regular season (handleStartSeason
// in App.tsx). Drives the real stat leaderboards and the production-based
// awards, instead of deciding those from ratings alone.
export interface PlayerSeasonStats {
  gp: number;   // games played (rotation appearances)
  mpg: number;  // minutes per game
  ppg: number;  // points
  rpg: number;  // rebounds
  apg: number;  // assists
  spg: number;  // steals
  bpg: number;  // blocks
  tpg: number;  // turnovers
}

// Running career totals, folded in once per completed season from that season's
// seasonStats (see accumulateCareers in services/careerService.ts) just before
// the averages are wiped for the new season. Counting totals rather than
// averages keeps this cheap to update and lets the UI re-derive per-game
// numbers on demand. Undefined until a player finishes their first season with
// at least one game logged — a fresh draft prospect has none.
export interface PlayerCareer {
  seasons: number;  // seasons with at least one game played
  gp: number;
  pts: number;      // career totals, not averages
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  peakOvr: number;  // best OVR ever carried, so a decline still shows the peak
  // Honors, counted so a retirement (and a future Hall of Fame) has real weight.
  titles: number;
  mvp: number;
  dpoy: number;
  roy: number;
  smoy: number;
  mip: number;
  allStar: number;
  allNba: number;
  finalsMvp: number;
}

export interface Player {
  id: string;
  name: string;
  pos: string;
  positions?: string[];
  ovr: number;
  off: number;
  def: number;
  // Optional so older saves / any data predating the attribute rebuild still
  // typecheck; UI and sim fall back gracefully when it's absent.
  attributes?: PlayerAttributes;
  // OVR the player carried through *last* season, snapshotted just before the
  // offseason progression bump (handleStartNewSeason). Lets the sim award Most
  // Improved Player by real OVR growth. Undefined in the first season and for
  // fresh draft prospects (nobody to compare against).
  ovrLastSeason?: number;
  seasonStats?: PlayerSeasonStats;
  career?: PlayerCareer;
  // Set when the player hangs it up in the offseason (see rollRetirements in
  // services/careerService.ts). A retired player is removed from every roster
  // but deliberately KEPT in SeasonState.players, because award history and
  // draft/championship records reference players by id and must never dangle.
  // Everything that treats "not on a roster" as "available" therefore has to
  // exclude them — getFreeAgents, the Scout list, the leaders fallback.
  retired?: boolean;
  retiredSeason?: number; // 1-indexed season after which they retired
  // True only while the player is an UNDRAFTED prospect in the current draft
  // class. Their real ovr/attributes are already in this object (the sim needs
  // them the moment they're picked), so the fog of war is purely a display
  // contract: anything that lists players by their true rating MUST skip these
  // — see getFreeAgents and the Scout list. Cleared by applyPick in
  // draftService, which is the moment the truth becomes public.
  prospect?: boolean;
  // Stamped when drafted, so a bust or a steal stays legible afterwards: what
  // the board projected, how sure it claimed to be (`band`, the error bar at
  // pick time), and — in `ovr` — what the team actually got. See draftVerdict.
  draftInfo?: { pick: number; projected: number; band: number };
  espnId: number | null;
  nbaId?: number | null;
  photoUrl?: string;
  age: number;
  number: number;
  potential: 'A' | 'B' | 'C' | 'D';
  salary: number;
  contractYears: number;
  // Player happiness (0-100), driven by team success, role/minutes, and being
  // buried behind better players — see updateMorale in simulationService.ts.
  // Undefined until the sim first touches it; treated as 70 (content) by
  // getMorale. Feeds team chemistry (a small game modifier) and, when it
  // bottoms out for a rotation-caliber player, a trade request.
  morale?: number;
  // Accumulated in-season fatigue (0-100), built by recordGameStats from
  // actual minutes played — heavy nights push it up, light ones let it fade.
  // Undefined until the sim first touches it; treated as 0 (fresh) by
  // getLoad. Raises injury risk (see injuryRisk in simulationService.ts);
  // the whole point of Team.loadManagedIds is to keep this number down.
  load?: number;
}

export interface TeamStats {
  ppg: number; // Points Per Game
  oppg: number; // Opponent Points Per Game
  rpg: number; // Rebounds Per Game
  apg: number; // Assists Per Game
  spg: number; // Steals Per Game
  bpg: number; // Blocks Per Game
  tpg: number; // Turnovers Per Game
}

export interface Team {
  id: string;
  name:string;
  conference: 'East' | 'West';
  logoUrl: string;
  roster: string[];
  coach: string;
  powerRank: number;
  sixthMan: string;
  // User's fixed starter pick per position slot (PG/SG/SF/PF/C). Sticks until
  // manually changed — the sim only deviates from it in-game when the
  // designated starter is hurt/suspended or in a big enough slump that a
  // same-position bench player is rated higher (see getLineup in
  // simulationService.ts). Undefined/missing slots fall back to an
  // auto-picked best-OVR-at-position starter.
  starters?: { [pos: string]: string };
  wins?: number;
  losses?: number;
  playerAbsences?: { [playerId: string]: { reason: 'injury' | 'suspension'; duration: number } };
  playerStatusEffects?: { [playerId: string]: { type: 'hot' | 'slump'; duration: number; ovrChange: number } };
  momentum?: number;
  performanceHistory?: { gamesPlayed: number; wins: number; }[];
  streak?: number;
  style?: 'Pace and Space' | 'Grit and Grind' | 'Balanced' | 'Run and Gun' | 'Defense First';
  stats?: TeamStats;
  // First-round picks this team currently OWNS — its own and any acquired by
  // trade. Optional because data/teams.json predates them; initSeason fills a
  // rolling three-draft window and every read goes through picksOf().
  picks?: DraftPickAsset[];
  // The functional coach, keyed into SeasonState.coaches. `coach` (below)
  // stays as the raw display name data/teams.json ships with, but once a
  // season starts the sim only ever reads through coachId — see coachOf() in
  // constants.ts. Optional for the same reason picks is: initSeason fills it.
  coachId?: string;
  // How many players share real minutes (bounded ROTATION_MIN-ROTATION_MAX in
  // simulationService.ts). Undefined = DEFAULT_ROTATION_SIZE. A tighter
  // rotation concentrates minutes (and therefore rating weight, load, and
  // injury exposure) onto fewer players; a deeper one spreads it thinner.
  rotationSize?: number;
  // Player ids the user has flagged for load management — see
  // LOAD_MANAGED_FACTOR in simulationService.ts. Purely a persistent opt-in;
  // stale ids (a since-traded/waived player) are harmless, nothing ever
  // matches them against a roster they're no longer on.
  loadManagedIds?: string[];
}

// A tradeable future first-round pick. The slot isn't known until draft night:
// it's whatever `originalTeamId`'s record (and the lottery) produces, which is
// what makes a bad team's pick a valuable asset and tanking a real strategy.
export interface DraftPickAsset {
  id: string;
  originalTeamId: string; // whose record sets the slot — never changes hands
  draft: number;          // which draft it conveys in (1 = the draft after season 1)
  // Conveys only if the slot lands OUTSIDE the top N; otherwise it stays with
  // the original team and the obligation rolls to the next draft, unprotected
  // (see buildDraftBoard). Undefined = unprotected.
  protection?: number;
}

// A head coach. Attributes sit on the same 60-99 scale as player ratings so
// they read consistently, but they never touch a player's own off/def — they
// feed small, bounded team-level modifiers (see services/coachService.ts):
// offense/defense nudge scoring, development speeds up how fast young players
// on the roster grow. `style` is the coach's scheme; how well it matches the
// team's own Team.style (coachFit) scales all three effects — a coach forced
// into a system he doesn't believe in underperforms his own numbers.
export interface Coach {
  id: string;
  name: string;
  age: number;
  offense: number;
  defense: number;
  development: number;
  style: NonNullable<Team['style']>;
}

export interface PlayoffSeries {
  m: (Team | null)[];
  w?: Team | null;
  s?: string;
}

export interface PlayoffBracketData {
  round1: PlayoffSeries[];
  round2: PlayoffSeries[];
  round3: PlayoffSeries[];
  winner: Team | null;
}

// Seeds 7-10 play in for the conference's final two playoff spots: 7 vs 8
// (winner takes the 7 seed), 9 vs 10 (loser eliminated), then the 7v8 loser
// vs the 9v10 winner for the 8 seed. Single games, not best-of-7 series.
export interface PlayInBracket {
  sevenEight: PlayoffSeries;
  nineTen: PlayoffSeries;
  finalSeed: PlayoffSeries;
  complete: boolean;
}

export interface PlayoffConference {
  initialSeeds: Team[];
  seeds: Team[];
  playIn?: PlayInBracket;
  bracket: PlayoffBracketData;
  winner?: Team | null;
}

// Regular-season awards, all decided by simulated production (see
// generateAwards in simulationService.ts). Individual winners are player ids;
// allNba is three teams of five ids (1st/2nd/3rd). mip is absent in season 1,
// when there's no prior-season OVR to measure improvement against.
export interface Awards {
  mvp: string;
  dpoy: string;
  roy: string;
  smoy: string;
  mip?: string;
  allNba?: string[][];
}

// One completed season's headline honors, kept so the user can look back over a
// franchise's history (see SeasonState.awardHistory, appended when a champion
// is crowned). Player/team references are ids, resolved against the live pools
// at display time (the league is a closed set, so nobody is ever lost).
export interface SeasonAwardRecord {
  season: number;            // 1-indexed season number
  championId: string | null;
  mvp: string;
  dpoy: string;
  roy: string;
  smoy: string;
  mip?: string;
  finalsMvp?: string;
}

// Points at the exact series slot a paused Game 7 belongs to, so the result
// can be written back to the right spot in the bracket once the live game
// resolves (see applyDeciderResult in simulationService.ts) without having to
// re-simulate anything or restructure how the rest of the bracket resolves.
export type PendingDeciderRef =
  | { scope: 'conference'; conf: 'east' | 'west'; round: 'round1' | 'round2' | 'round3'; index: number }
  | { scope: 'finals' };

export interface PlayoffState {
  east: PlayoffConference;
  west: PlayoffConference;
  finals: PlayoffSeries | null;
  champion: Team | null;
  awards: {
    eastConfFinalsMVP?: string;
    westConfFinalsMVP?: string;
    finalsMVP?: string;
  };
  // Set when a series tied 3-3 involving the user's team is about to be
  // decided — advancePlayoffRound stops short of simulating Game 7 for that
  // one series (every other series in the same round still resolves
  // normally) and the app routes to the live-game screen instead. Cleared by
  // applyDeciderResult once the live game concludes.
  pendingDecider?: PendingDeciderRef;
}

// A one-time strategic pick the user makes for the NEXT quarter only (must be
// re-picked each quarter — nothing carries over). See TACTIC_META in
// simulationService.ts for the actual point deltas each one applies.
export type LiveTactic = 'ritmo' | 'defesa' | 'isolar';

// The user's decisive Game 7 (or Finals-clinching game), played out quarter
// by quarter instead of resolved in one shot like every other game in the
// sim. Pure state — advanceLiveQuarter in simulationService.ts is the only
// thing that mutates it, one quarter at a time, driven by the timeout/tactic
// the user queued up before pressing "Simular Quarto".
export interface LiveGameState {
  ref: PendingDeciderRef; // where this game's result gets written back once resolved
  teamAId: string; // hosts the game — the bracket's m[0], by convention the better seed
  teamBId: string;
  userIsTeamA: boolean; // which side the user's timeouts/tactics apply to
  quarter: number; // 1-4 regulation, 5+ = OT periods
  scoreA: number;
  scoreB: number;
  quarterScores: { a: number; b: number; label: string }[]; // completed periods, in order
  timeoutsLeft: number;
  pendingTimeout: boolean; // queued for the NEXT quarter, consumed by advanceLiveQuarter
  pendingTactic: LiveTactic | null; // queued for the NEXT quarter, consumed by advanceLiveQuarter
  log: string[]; // most recent first
  complete: boolean;
  winnerId?: string;
}

export type SeasonStatus = 'idle' | 'active' | 'finished' | 'awards' | 'playoffs_idle' | 'playoffs_simulating' | 'champion' | 'offseason' | 'draft' | 'free_agency';
export type PlayoffStage = 'none' | 'playin' | 'round1' | 'semis' | 'confFinals' | 'finals' | 'complete';

export interface Event {
  message: string;
  type: string;
}

export interface Notification extends Event {
  id: number;
}

export interface SeasonState {
  status: SeasonStatus;
  playoffStage: PlayoffStage;
  gamesPlayed: number;
  teams: Team[];
  players: { [key: string]: Player };
  events: Event[];
  playoff: PlayoffState | null;
  awards: Awards | null;
  userTeamId: string;
  // Whether the real-world offseason trades/signings (data/offseason_moves.json)
  // have already been replayed into this save. Only applied once, the first
  // time "Iniciar Nova Temporada" is used — later season transitions have no
  // further real-world data to diff against.
  offseasonMovesApplied?: boolean;
  // Latest AI-generated league-wide commentary and the gamesPlayed checkpoint
  // it was generated at, so the app knows not to re-request it until the next
  // COMMENTARY_INTERVAL checkpoint (see App.tsx).
  leagueCommentary?: { text: string; gamesPlayed: number };
  // Set once the ALL_STAR_GAME checkpoint fires (see App.tsx); undefined
  // before that point in the season.
  allStar?: AllStarResult;
  // NBA Cup group draw + (once resolved) standings and knockout bracket.
  // Groups are assigned at season start so they're visible before the group
  // stage actually concludes; standings/bracket fill in at CUP_GROUP_END.
  cup?: CupState;
  // Career totals for the user as GM, accumulated across every completed
  // season in this save (see advancePlayoffs in App.tsx, which increments
  // this the moment a champion is crowned) — deliberately NOT reset by
  // handleStartNewSeason, unlike wins/losses/stats.
  gmLegacy: GmLegacy;
  // Headline awards from every completed season in this save, newest last —
  // appended when a champion is crowned (advancePlayoffs). Powers the award
  // history / hall of honors on the Prêmios screen. Carried across seasons.
  awardHistory: SeasonAwardRecord[];
  // The owner's mandate + the user's job security for the current season (see
  // ownerService.ts). Re-derived at each season start, updated as games are
  // played, and judged when a champion is crowned.
  owner: OwnerExpectation;
  // Rookie draft, held in the offseason between "Nova Temporada" and free
  // agency (matching the real NBA calendar). Present only while
  // status === 'draft'; the prospect Players themselves live in `players` and
  // are referenced by id here. Cleared once the draft finishes.
  draft?: DraftState;
  // The season's pre-generated 82-game fixture list (regenerated fresh by
  // handleStartSeason once rosters are final). Empty during the draft/free-
  // agency offseason phases, when there's no active schedule to speak of.
  schedule: ScheduleGame[];
  // Player ids who retired in the most recent offseason, so the draft screen
  // can show the class that just left the league. Replaced (not appended) each
  // offseason; the permanent record is Player.retired/retiredSeason.
  lastRetirements?: string[];
  // Pending trade proposals CPU teams have sent the user during the season
  // (generated in simulateDay, shown in the Trade Center). Cleared at the
  // trade deadline and at each season reset.
  tradeOffers?: TradeOffer[];
  // Every coach currently employed by a team, keyed by id — a closed set like
  // `players`, but coaches who leave (fired or retired) are simply dropped;
  // nothing else references a coach by id once he's off a roster, so unlike a
  // retired player there's no history to preserve. Built by initCoaches at
  // initSeason, aged/replaced each offseason (see services/coachService.ts).
  coaches: { [key: string]: Coach };
  // Present only while a Game 7 (or Finals-clinching game) involving the user
  // is being played out live — see PlayoffState.pendingDecider. Cleared once
  // the game resolves and its result is written back into the bracket.
  liveGame?: LiveGameState;
}

// A single-round rookie draft. Order is worst-to-first by the just-finished
// season's record. Prospects are procedurally generated (nba_api has no future
// draft classes), stored in SeasonState.players and referenced by id.
export interface DraftPick {
  pick: number;      // 1-indexed overall pick number
  teamId: string;    // who actually made the selection
  playerId: string;
  // Set when the slot came from another team's pick, for the "via BKN" label.
  viaTeamId?: string;
}

// One slot on the draft board: whose record earned it (`originalTeamId`) versus
// who gets to use it (`teamId`). They differ whenever the pick was traded.
export interface DraftSlot {
  teamId: string;
  originalTeamId: string;
}

export interface DraftState {
  order: DraftSlot[];    // slots in pick order (lottery for the top 4, then worst record first)
  picks: DraftPick[];    // completed picks, in order
  available: string[];   // prospect player ids not yet drafted
  complete: boolean;
  // Fog of war: the league's read on each prospect, keyed by player id. This —
  // not Player.ovr — is what the draft screen and the CPU draft off of.
  reports: { [playerId: string]: ScoutReport };
  // Scouting reports the user has left to spend this draft (see SCOUT_BUDGET).
  scoutBudget: number;
}

// What the front office *thinks* a prospect is, before the draft reveals the
// truth. `estimate` is a noisy read of the player's real ovr and `uncertainty`
// is the half-width of the band shown to the user; scouting shrinks the band
// and pulls the estimate toward reality. The noise is deliberately allowed to
// exceed the band, which is what makes real busts and steals possible.
export interface ScoutReport {
  estimate: number;
  uncertainty: number;
  potentialGuess: Player['potential'];
  potentialKnown: boolean;  // true once fully scouted: estimate === real ovr
  reports: number;          // scouting reports spent on this prospect
  notes: string[];          // one blurb revealed per report, oldest first
}

export interface GmLegacy {
  seasons: number;
  titles: number;
}

// What the owner expects of the user this season, and how safe the user's job
// is. The mandate + win target are re-derived from roster strength every season
// start (see ownerService.ts); confidence moves with results during the season
// and is judged at season's end, with a bad enough outcome getting the GM fired.
export type OwnerMandate = 'championship' | 'contender' | 'playoffs' | 'develop' | 'rebuild';

export interface OwnerExpectation {
  mandate: OwnerMandate;
  targetWins: number;   // regular-season wins the owner expects
  confidence: number;   // 0-100 job security
  fired: boolean;       // set true when the owner lets the GM go
  note?: string;        // latest owner message (season mandate, praise, warning)
}

// A trade proposal a CPU team sends TO the user (see generateCpuTradeOffer in
// services/tradeService.ts). The CPU wants `requestIds` (the user's players)
// and offers `offerIds` (its own) in return. Pending offers live on
// SeasonState.tradeOffers until the user accepts/rejects one or the trade
// deadline passes.
export interface TradeOffer {
  id: string;
  fromTeamId: string;
  requestIds: string[]; // user players the CPU wants
  offerIds: string[];   // CPU players offered in return
  // Draft picks the CPU is throwing in — how a rebuilding team pays for a
  // veteran it can't match with bodies. Ids of assets it actually holds.
  offerPickIds?: string[];
}

export interface OffseasonMove {
  playerId: string;
  playerName: string;
  fromTeamId: string;
  toTeamId: string;
}

export interface AllStarResult {
  eastRoster: string[];
  westRoster: string[];
  winner: 'east' | 'west';
  mvpId: string;
  dunkWinnerId: string;
  threePointWinnerId: string;
  gamesPlayed: number;
}

// One entry in the pre-generated 82-game regular-season schedule (see
// generateSchedule in services/scheduleService.ts). Generated once at season
// start so the day-by-day sim plays a real fixture list (conference-weighted,
// home/away balanced) instead of re-shuffling all 30 teams at random every
// day — this is also what makes head-to-head/conference-record tiebreakers
// possible, since results are recorded per fixture.
export interface ScheduleGame {
  day: number;
  homeTeamId: string;
  awayTeamId: string;
  played: boolean;
  homeScore?: number;
  awayScore?: number;
}

export interface CupState {
  // groupId -> team ids (e.g. "East A" -> [...5 team ids])
  groups: { [groupId: string]: string[] };
  // Filled in at CUP_GROUP_END from each team's regular season record at that
  // checkpoint — no extra games are simulated for the group stage itself.
  standings?: { [teamId: string]: { w: number; l: number } };
  bracket?: { qf: PlayoffSeries[]; sf: PlayoffSeries[]; final: PlayoffSeries | null };
  championId?: string | null;
}
