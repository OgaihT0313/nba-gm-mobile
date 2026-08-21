import type { Player, Team, OffseasonMove } from '../../types';
// --- Kobe Era (2000-01 .. 2009-10) ---
import threepeat2001Players from './lakers-threepeat-2000-01/players.json';
import threepeat2001Teams from './lakers-threepeat-2000-01/teams.json';
import threepeat2001Moves from './lakers-threepeat-2000-01/offseason_moves.json';
import threepeat2001Draft from './lakers-threepeat-2000-01/draft_class.json';
import iverson2002Players from './iverson-mvp-2001-02/players.json';
import iverson2002Teams from './iverson-mvp-2001-02/teams.json';
import iverson2002Moves from './iverson-mvp-2001-02/offseason_moves.json';
import iverson2002Draft from './iverson-mvp-2001-02/draft_class.json';
import lakers2003Players from './lakers-threepeat-2002-03/players.json';
import lakers2003Teams from './lakers-threepeat-2002-03/teams.json';
import lakers2003Moves from './lakers-threepeat-2002-03/offseason_moves.json';
import lakers2003Draft from './lakers-threepeat-2002-03/draft_class.json';
import pistons2004Players from './pistons-upset-2003-04/players.json';
import pistons2004Teams from './pistons-upset-2003-04/teams.json';
import pistons2004Moves from './pistons-upset-2003-04/offseason_moves.json';
import pistons2004Draft from './pistons-upset-2003-04/draft_class.json';
import spurs2005Players from './spurs-2004-05/players.json';
import spurs2005Teams from './spurs-2004-05/teams.json';
import spurs2005Moves from './spurs-2004-05/offseason_moves.json';
import spurs2005Draft from './spurs-2004-05/draft_class.json';
import kobe2006Players from './kobe-81-2005-06/players.json';
import kobe2006Teams from './kobe-81-2005-06/teams.json';
import kobe2006Moves from './kobe-81-2005-06/offseason_moves.json';
import kobe2006Draft from './kobe-81-2005-06/draft_class.json';
import spursSweep2007Players from './spurs-sweep-2006-07/players.json';
import spursSweep2007Teams from './spurs-sweep-2006-07/teams.json';
import spursSweep2007Moves from './spurs-sweep-2006-07/offseason_moves.json';
import spursSweep2007Draft from './spurs-sweep-2006-07/draft_class.json';
import celtics2008Players from './celtics-big3-2007-08/players.json';
import celtics2008Teams from './celtics-big3-2007-08/teams.json';
import celtics2008Moves from './celtics-big3-2007-08/offseason_moves.json';
import celtics2008Draft from './celtics-big3-2007-08/draft_class.json';
import gasol2009Players from './kobe-gasol-2008-09/players.json';
import gasol2009Teams from './kobe-gasol-2008-09/teams.json';
import gasol2009Moves from './kobe-gasol-2008-09/offseason_moves.json';
import gasol2009Draft from './kobe-gasol-2008-09/draft_class.json';
import rematch2010Players from './lakers-celtics-rematch-2009-10/players.json';
import rematch2010Teams from './lakers-celtics-rematch-2009-10/teams.json';
import rematch2010Moves from './lakers-celtics-rematch-2009-10/offseason_moves.json';
import rematch2010Draft from './lakers-celtics-rematch-2009-10/draft_class.json';
// --- LeBron/Warriors Era (2010-11 .. 2019-20) ---
import heatles2011Players from './heatles-2010-11/players.json';
import heatles2011Teams from './heatles-2010-11/teams.json';
import heatles2011Moves from './heatles-2010-11/offseason_moves.json';
import heatles2011Draft from './heatles-2010-11/draft_class.json';
import lockout2012Players from './lockout-2011-12/players.json';
import lockout2012Teams from './lockout-2011-12/teams.json';
import lockout2012Moves from './lockout-2011-12/offseason_moves.json';
import lockout2012Draft from './lockout-2011-12/draft_class.json';
import threepeat2013Players from './threepeat-2012-13/players.json';
import threepeat2013Teams from './threepeat-2012-13/teams.json';
import threepeat2013Moves from './threepeat-2012-13/offseason_moves.json';
import threepeat2013Draft from './threepeat-2012-13/draft_class.json';
import beautifulGame2014Players from './beautiful-game-2013-14/players.json';
import beautifulGame2014Teams from './beautiful-game-2013-14/teams.json';
import beautifulGame2014Moves from './beautiful-game-2013-14/offseason_moves.json';
import beautifulGame2014Draft from './beautiful-game-2013-14/draft_class.json';
import warriors2015Players from './warriors-2014-15/players.json';
import warriors2015Teams from './warriors-2014-15/teams.json';
import warriors2015Moves from './warriors-2014-15/offseason_moves.json';
import warriors2015Draft from './warriors-2014-15/draft_class.json';
import lebron2016Players from './lebron-2015-16/players.json';
import lebron2016Teams from './lebron-2015-16/teams.json';
import lebron2016Moves from './lebron-2015-16/offseason_moves.json';
import lebron2016Draft from './lebron-2015-16/draft_class.json';
import durantWarriors2017Players from './durant-warriors-2016-17/players.json';
import durantWarriors2017Teams from './durant-warriors-2016-17/teams.json';
import durantWarriors2017Moves from './durant-warriors-2016-17/offseason_moves.json';
import durantWarriors2017Draft from './durant-warriors-2016-17/draft_class.json';
import rockets2018Players from './rockets-2017-18/players.json';
import rockets2018Teams from './rockets-2017-18/teams.json';
import rockets2018Moves from './rockets-2017-18/offseason_moves.json';
import rockets2018Draft from './rockets-2017-18/draft_class.json';
import raptors2019Players from './raptors-2018-19/players.json';
import raptors2019Teams from './raptors-2018-19/teams.json';
import raptors2019Moves from './raptors-2018-19/offseason_moves.json';
import raptors2019Draft from './raptors-2018-19/draft_class.json';
import bubble2020Players from './bubble-2019-20/players.json';
import bubble2020Teams from './bubble-2019-20/teams.json';
import bubble2020Moves from './bubble-2019-20/offseason_moves.json';

// A registry of playable historical starting points ("NBA Eras"). Each entry
// is a self-contained real roster/rating snapshot generated by
// nba-gm-simulator/pipeline/fetch_data.py --season <X> --skip-offseason-moves
// --out data/eras/<id> — the SAME pipeline/rating model the live current-season
// data uses, just pointed at a past season instead of today's.
//
// This is a SNAPSHOT, not a time machine: picking an era only changes what
// initSeason (App.tsx) seeds SeasonState.players/teams with. From team
// confirmation onward the save plays with 100% of today's mechanics —
// procedural free agency, trades, progression — nothing here re-simulates
// real NBA history going forward, with two chained EXCEPTIONS: offseasonMoves
// (real trades/signings) and realDraftClass (real rookies) below.
//
// Seasons before 2015-16 predate the NBA's hustle-stats tracking (and
// 2013-14/2014-15 predate full player-tracking defense), so the pipeline's
// perimeterD/interiorD attributes lean more on steals/blocks/rebound% alone
// for those years — ratings are still real-stat-driven, just slightly less
// granular on the defensive breakdown. Seasons before 2007-08 additionally
// predate the ESPN Fantasy position feed (positions.py's primary source) —
// those years fall back to Sleeper, then to nba_api's coarse G/F/C code
// widened to the middle of its family (e.g. every "F" becomes SF), so a 2000s
// roster has fewer real multi-position combos than a post-2010 one. Seasons
// at or before 1995-96 are NOT here and never will be with this pipeline: its
// core rating source (leaguedashplayerstats) returns zero rows that far back,
// which the pipeline doesn't error on — it silently writes a flat 66/66/66 to
// every single player. Magic/Bird and prime Jordan are blocked on this until
// an alternative historical stats source is found (Basketball-Reference
// already 403s automated requests) — deliberately not attempted here.
//
// teams.json names were hand-corrected for franchises that later
// renamed/relocated (New Jersey Nets → Brooklyn, Seattle SuperSonics →
// Oklahoma City, Charlotte Hornets → Bobcats → Hornets again in 2014,
// Charlotte Hornets → New Orleans → Pelicans) so each era shows the name the
// team actually played under that season; logos still use the current
// franchise crest since no historical crest is hosted at the CDN this app
// pulls from. Two seasons (2002-03, 2003-04) genuinely have only 29 teams —
// Charlotte had no NBA franchise at all between the original Hornets leaving
// for New Orleans (2002) and the Bobcats' first season (2004) — the app's
// standings/playoffs/lottery code already works off `teams.length` rather
// than an assumed 30, so this needed no code change, just verification.
//
// Each era is its own static import (Metro can't resolve a JSON path built
// from a runtime variable), so adding a new era means adding a matching
// `data/eras/<id>/` folder on disk with all four imports (players/teams/
// offseason_moves/draft_class) here.
export interface EraDefinition {
  id: string;
  label: string;
  seasonLabel: string;
  /** One-line flavor text shown on the era picker. */
  blurb: string;
  players: { [key: string]: Player };
  teams: Team[];
  // Real trades/signings between THIS era's season and the next chronological
  // era's — generated by pipeline/sync_era_moves.py (nba-gm-simulator), which
  // diffs this era's on-disk roster against next season's real NBA rosters
  // (same mechanism the live current-season data uses for its own one-shot
  // replay, see offseasonMoves in App.tsx). App.tsx's handleStartNewSeason
  // walks the ERAS array forward one entry per in-save offseason
  // (SeasonState.eraChainIndex), so an era save keeps replaying real history
  // year over year instead of being a single disconnected snapshot. The last
  // chronological entry (bubble-2019-20) has an empty list — no further
  // chained season was pulled — which is also what any entry naturally
  // degrades to once the user's own moves have diverged the save from real
  // history (each move is skipped individually if it no longer matches
  // current save state).
  offseasonMoves: { fromSeason: string; toSeason: string; moves: OffseasonMove[] };
  // The REAL draft class entering the league at this era's chained
  // transition — generated by pipeline/sync_era_draft.py, which pulls the
  // real round-1 order (nba_api's drafthistory) and cross-references each
  // pick's rookie-year rating against the NEXT era's already-fetched
  // players.json (a rookie's real attribute breakdown already exists there
  // the moment that next season was pulled — no separate rating step).
  // `playerId` is null for a pick that never cleared the rating pipeline's
  // minimum GP/MPG as a rookie (hurt, stashed overseas, D-League); the app
  // substitutes one procedural prospect for that single slot, same
  // per-item fallback the offseason-moves chain already uses. Deliberately
  // carries no team info — WHICH team lands each pick stays driven by this
  // save's own standings/lottery, not real history's; only WHO enters the
  // league and their real rating is replayed. Undefined for bubble-2019-20
  // (no further chained season was pulled) — the chain naturally goes fully
  // procedural once this runs out, same as offseasonMoves.
  realDraftClass?: { draftYear: string; picks: { overallPick: number; playerId: string | null; playerName: string }[] };
}

// `ERAS` is ONE continuous chronological array spanning both eras below —
// eraChainIndex (App.tsx) just walks it forward by index, so extending this
// array (in order) is the entire integration cost of adding a new decade; it
// never needed to know about `ERA_GROUPS`.
export const ERAS: EraDefinition[] = [
  // --- Kobe Era ---
  {
    id: 'lakers-threepeat-2000-01',
    label: 'O MVP do Iverson',
    seasonLabel: '2000-01',
    blurb: 'Iverson é MVP e leva o Sixers à final — mas o Lakers de Shaq e Kobe começa o three-peat.',
    players: threepeat2001Players as unknown as { [key: string]: Player },
    teams: threepeat2001Teams as unknown as Team[],
    offseasonMoves: threepeat2001Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: threepeat2001Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'iverson-mvp-2001-02',
    label: 'Segundo Anel Seguido',
    seasonLabel: '2001-02',
    blurb: 'Kidd leva o Nets à primeira final da franquia — e é varrido pelo Lakers, que fecha o bicampeonato.',
    players: iverson2002Players as unknown as { [key: string]: Player },
    teams: iverson2002Teams as unknown as Team[],
    offseasonMoves: iverson2002Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: iverson2002Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'lakers-threepeat-2002-03',
    label: 'O Three-Peat Termina',
    seasonLabel: '2002-03',
    blurb: 'O Lakers cai nas semis do Oeste pro Spurs de Duncan, que fecha o ano com o título contra o Nets.',
    players: lakers2003Players as unknown as { [key: string]: Player },
    teams: lakers2003Teams as unknown as Team[],
    offseasonMoves: lakers2003Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: lakers2003Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'pistons-upset-2003-04',
    label: 'A Zebra do Pistons',
    seasonLabel: '2003-04',
    blurb: 'O "Fab Four" de Shaq, Kobe, Malone e Payton é favorito — e o Pistons de Billups dá a zebra em 5 jogos.',
    players: pistons2004Players as unknown as { [key: string]: Player },
    teams: pistons2004Teams as unknown as Team[],
    offseasonMoves: pistons2004Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: pistons2004Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'spurs-2004-05',
    label: 'O Segundo Anel do Duncan',
    seasonLabel: '2004-05',
    blurb: 'Spurs e Pistons fazem 7 jogos de final — Duncan é MVP das finais de novo e fecha o terceiro título da franquia.',
    players: spurs2005Players as unknown as { [key: string]: Player },
    teams: spurs2005Teams as unknown as Team[],
    offseasonMoves: spurs2005Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: spurs2005Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'kobe-81-2005-06',
    label: 'Os 81 Pontos do Kobe',
    seasonLabel: '2005-06',
    blurb: 'Kobe faz 81 pontos contra o Toronto — e o Heat de Wade vira de 0-2 pra ganhar o primeiro título da franquia.',
    players: kobe2006Players as unknown as { [key: string]: Player },
    teams: kobe2006Teams as unknown as Team[],
    offseasonMoves: kobe2006Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: kobe2006Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'spurs-sweep-2006-07',
    label: 'A Varrida do Duncan',
    seasonLabel: '2006-07',
    blurb: 'Spurs varrem o Cavaliers na primeira final do LeBron — Tony Parker é o MVP da decisão.',
    players: spursSweep2007Players as unknown as { [key: string]: Player },
    teams: spursSweep2007Teams as unknown as Team[],
    offseasonMoves: spursSweep2007Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: spursSweep2007Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'celtics-big3-2007-08',
    label: 'O Big Three de Boston',
    seasonLabel: '2007-08',
    blurb: 'Garnett, Pierce e Allen se juntam em Boston e batem o Lakers do Kobe na final, encerrando 22 anos de jejum.',
    players: celtics2008Players as unknown as { [key: string]: Player },
    teams: celtics2008Teams as unknown as Team[],
    offseasonMoves: celtics2008Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: celtics2008Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'kobe-gasol-2008-09',
    label: 'O Primeiro Anel Sem o Shaq',
    seasonLabel: '2008-09',
    blurb: 'Kobe e Gasol batem o Magic de Dwight Howard na final — o primeiro anel do Kobe como MVP das finais.',
    players: gasol2009Players as unknown as { [key: string]: Player },
    teams: gasol2009Teams as unknown as Team[],
    offseasonMoves: gasol2009Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: gasol2009Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'lakers-celtics-rematch-2009-10',
    label: 'A Revanche',
    seasonLabel: '2009-10',
    blurb: 'Revanche da final de 2008: Lakers e Celtics vão a 7 jogos, e Kobe fecha o segundo anel seguido como MVP.',
    players: rematch2010Players as unknown as { [key: string]: Player },
    teams: rematch2010Teams as unknown as Team[],
    offseasonMoves: rematch2010Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: rematch2010Draft as unknown as EraDefinition['realDraftClass'],
  },
  // --- LeBron/Warriors Era ---
  {
    id: 'heatles-2010-11',
    label: 'Heatles',
    seasonLabel: '2010-11',
    blurb: 'LeBron, Wade e Bosh se juntam em Miami — e esbarram no Dirk dos Mavericks na final.',
    players: heatles2011Players as unknown as { [key: string]: Player },
    teams: heatles2011Teams as unknown as Team[],
    offseasonMoves: heatles2011Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: heatles2011Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'lockout-2011-12',
    label: 'Temporada do Lockout',
    seasonLabel: '2011-12',
    blurb: 'Só 66 jogos, LeBron MVP e o primeiro título do Heat.',
    players: lockout2012Players as unknown as { [key: string]: Player },
    teams: lockout2012Teams as unknown as Team[],
    offseasonMoves: lockout2012Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: lockout2012Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'threepeat-2012-13',
    label: 'Heat Bicampeão',
    seasonLabel: '2012-13',
    blurb: '27 vitórias seguidas e o segundo anel consecutivo de LeBron.',
    players: threepeat2013Players as unknown as { [key: string]: Player },
    teams: threepeat2013Teams as unknown as Team[],
    offseasonMoves: threepeat2013Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: threepeat2013Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'beautiful-game-2013-14',
    label: 'O Jogo Bonito',
    seasonLabel: '2013-14',
    blurb: 'Spurs de Popovich e Duncan destroem o Heat na revanche das Finais.',
    players: beautifulGame2014Players as unknown as { [key: string]: Player },
    teams: beautifulGame2014Teams as unknown as Team[],
    offseasonMoves: beautifulGame2014Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: beautifulGame2014Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'warriors-2014-15',
    label: 'Início da Dinastia',
    seasonLabel: '2014-15',
    blurb: 'Steve Kerr assume e o Warriors de Curry conquista o primeiro título da era.',
    players: warriors2015Players as unknown as { [key: string]: Player },
    teams: warriors2015Teams as unknown as Team[],
    offseasonMoves: warriors2015Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: warriors2015Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'lebron-2015-16',
    label: 'LeBron Era',
    seasonLabel: '2015-16',
    blurb: 'Warriors 73-9, o Big Three do Heat já dissolvido, LeBron de volta a Cleveland.',
    players: lebron2016Players as unknown as { [key: string]: Player },
    teams: lebron2016Teams as unknown as Team[],
    offseasonMoves: lebron2016Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: lebron2016Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'durant-warriors-2016-17',
    label: 'A Revanche',
    seasonLabel: '2016-17',
    blurb: 'Durant se junta a Curry depois do 3-1 perdido — Warriors imparáveis.',
    players: durantWarriors2017Players as unknown as { [key: string]: Player },
    teams: durantWarriors2017Teams as unknown as Team[],
    offseasonMoves: durantWarriors2017Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: durantWarriors2017Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'rockets-2017-18',
    label: 'O Ano do MVP Harden',
    seasonLabel: '2017-18',
    blurb: 'Rockets de 65 vitórias quase derrubam a dinastia Warriors na final de conferência.',
    players: rockets2018Players as unknown as { [key: string]: Player },
    teams: rockets2018Teams as unknown as Team[],
    offseasonMoves: rockets2018Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: rockets2018Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'raptors-2018-19',
    label: 'O Ano do Kawhi',
    seasonLabel: '2018-19',
    blurb: 'Leonard chega em Toronto e entrega o primeiro título da franquia.',
    players: raptors2019Players as unknown as { [key: string]: Player },
    teams: raptors2019Teams as unknown as Team[],
    offseasonMoves: raptors2019Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: raptors2019Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'bubble-2019-20',
    label: 'A Bolha',
    seasonLabel: '2019-20',
    blurb: 'Temporada em Orlando pós-pandemia: LeBron e AD vencem em homenagem a Kobe.',
    players: bubble2020Players as unknown as { [key: string]: Player },
    teams: bubble2020Teams as unknown as Team[],
    offseasonMoves: bubble2020Moves as unknown as EraDefinition['offseasonMoves'],
    // No draft_class.json for this era — no further chained season was pulled.
  },
];

export const eraById = (id: string): EraDefinition | undefined => ERAS.find((e) => e.id === id);

// --- MyEras-style grouping (added on top of ERAS, additive-only — see the
// module comment on ERAS above: this never changes how eraChainIndex works,
// it's purely a display/entry-point layer). Picking a group starts the save
// at `seasonIds[0]` (its iconic/default season); EraSelect.tsx additionally
// lets the user expand a group to cherry-pick any of its other seasons
// instead, so nothing from the flat per-season list is lost.
export interface EraGroup {
  id: string;
  label: string;
  /** e.g. "2000-01 → 2009-10" */
  spanLabel: string;
  blurb: string;
  /** Key into src/theme/eraVisuals.ts's ERA_VISUALS lookup. */
  visualId: string;
  /** EraDefinition ids, in chronological order. First = default/iconic start. */
  seasonIds: string[];
}

export const ERA_GROUPS: EraGroup[] = [
  {
    id: 'kobe-era',
    label: 'Kobe Era',
    spanLabel: '2000-01 → 2009-10',
    blurb: 'Três anéis do three-peat, o "Fab Four" derrubado pelo Pistons, os 81 pontos e o bicampeonato sem o Shaq.',
    visualId: 'kobe-era',
    seasonIds: [
      'lakers-threepeat-2000-01',
      'iverson-mvp-2001-02',
      'lakers-threepeat-2002-03',
      'pistons-upset-2003-04',
      'spurs-2004-05',
      'kobe-81-2005-06',
      'spurs-sweep-2006-07',
      'celtics-big3-2007-08',
      'kobe-gasol-2008-09',
      'lakers-celtics-rematch-2009-10',
    ],
  },
  {
    id: 'lebron-warriors-era',
    label: 'LeBron/Warriors Era',
    spanLabel: '2010-11 → 2019-20',
    blurb: 'Heatles, o three-peat que virou bicampeonato, a ascensão da dinastia Warriors e a bolha de Orlando.',
    visualId: 'lebron-warriors-era',
    seasonIds: [
      'heatles-2010-11',
      'lockout-2011-12',
      'threepeat-2012-13',
      'beautiful-game-2013-14',
      'warriors-2014-15',
      'lebron-2015-16',
      'durant-warriors-2016-17',
      'rockets-2017-18',
      'raptors-2018-19',
      'bubble-2019-20',
    ],
  },
];

export const eraGroupForEraId = (eraId: string): EraGroup | undefined =>
  ERA_GROUPS.find((g) => g.seasonIds.includes(eraId));
