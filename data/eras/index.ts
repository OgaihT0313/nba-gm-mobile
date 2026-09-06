import type { Player, Team, OffseasonMove } from '../../types';
// --- Magic vs. Bird Era (1979-80 .. 1989-90) ---
import showtime1980Players from './showtime-begins-1979-80/players.json';
import showtime1980Teams from './showtime-begins-1979-80/teams.json';
import showtime1980Moves from './showtime-begins-1979-80/offseason_moves.json';
import showtime1980Draft from './showtime-begins-1979-80/draft_class.json';
import celticsRing1981Players from './celtics-first-ring-1980-81/players.json';
import celticsRing1981Teams from './celtics-first-ring-1980-81/teams.json';
import celticsRing1981Moves from './celtics-first-ring-1980-81/offseason_moves.json';
import celticsRing1981Draft from './celtics-first-ring-1980-81/draft_class.json';
import lakersRepeat1982Players from './lakers-repeat-1981-82/players.json';
import lakersRepeat1982Teams from './lakers-repeat-1981-82/teams.json';
import lakersRepeat1982Moves from './lakers-repeat-1981-82/offseason_moves.json';
import lakersRepeat1982Draft from './lakers-repeat-1981-82/draft_class.json';
import sixers1983Players from './sixers-fo-fo-fo-1982-83/players.json';
import sixers1983Teams from './sixers-fo-fo-fo-1982-83/teams.json';
import sixers1983Moves from './sixers-fo-fo-fo-1982-83/offseason_moves.json';
import sixers1983Draft from './sixers-fo-fo-fo-1982-83/draft_class.json';
import birdMvp1984Players from './bird-mvp-finals-1983-84/players.json';
import birdMvp1984Teams from './bird-mvp-finals-1983-84/teams.json';
import birdMvp1984Moves from './bird-mvp-finals-1983-84/offseason_moves.json';
import birdMvp1984Draft from './bird-mvp-finals-1983-84/draft_class.json';
import lakersRevenge1985Players from './lakers-revenge-1984-85/players.json';
import lakersRevenge1985Teams from './lakers-revenge-1984-85/teams.json';
import lakersRevenge1985Moves from './lakers-revenge-1984-85/offseason_moves.json';
import lakersRevenge1985Draft from './lakers-revenge-1984-85/draft_class.json';
import celtics1986Players from './celtics-greatest-team-1985-86/players.json';
import celtics1986Teams from './celtics-greatest-team-1985-86/teams.json';
import celtics1986Moves from './celtics-greatest-team-1985-86/offseason_moves.json';
import celtics1986Draft from './celtics-greatest-team-1985-86/draft_class.json';
import magicSkyhook1987Players from './magic-junior-skyhook-1986-87/players.json';
import magicSkyhook1987Teams from './magic-junior-skyhook-1986-87/teams.json';
import magicSkyhook1987Moves from './magic-junior-skyhook-1986-87/offseason_moves.json';
import magicSkyhook1987Draft from './magic-junior-skyhook-1986-87/draft_class.json';
import lakersBack2back1988Players from './lakers-back-to-back-1987-88/players.json';
import lakersBack2back1988Teams from './lakers-back-to-back-1987-88/teams.json';
import lakersBack2back1988Moves from './lakers-back-to-back-1987-88/offseason_moves.json';
import lakersBack2back1988Draft from './lakers-back-to-back-1987-88/draft_class.json';
import badBoys1989Players from './bad-boys-sweep-1988-89/players.json';
import badBoys1989Teams from './bad-boys-sweep-1988-89/teams.json';
import badBoys1989Moves from './bad-boys-sweep-1988-89/offseason_moves.json';
import badBoys1989Draft from './bad-boys-sweep-1988-89/draft_class.json';
import pistons1990Players from './pistons-repeat-1989-90/players.json';
import pistons1990Teams from './pistons-repeat-1989-90/teams.json';
import pistons1990Moves from './pistons-repeat-1989-90/offseason_moves.json';
import pistons1990Draft from './pistons-repeat-1989-90/draft_class.json';
// --- Jordan Era (1990-91 .. 1997-98) ---
import jordanRing1991Players from './jordan-first-ring-1990-91/players.json';
import jordanRing1991Teams from './jordan-first-ring-1990-91/teams.json';
import jordanRing1991Moves from './jordan-first-ring-1990-91/offseason_moves.json';
import jordanRing1991Draft from './jordan-first-ring-1990-91/draft_class.json';
import bulls1992Players from './bulls-second-ring-1991-92/players.json';
import bulls1992Teams from './bulls-second-ring-1991-92/teams.json';
import bulls1992Moves from './bulls-second-ring-1991-92/offseason_moves.json';
import bulls1992Draft from './bulls-second-ring-1991-92/draft_class.json';
import bullsThreepeat1993Players from './bulls-threepeat-1992-93/players.json';
import bullsThreepeat1993Teams from './bulls-threepeat-1992-93/teams.json';
import bullsThreepeat1993Moves from './bulls-threepeat-1992-93/offseason_moves.json';
import bullsThreepeat1993Draft from './bulls-threepeat-1992-93/draft_class.json';
import jordanBaseball1994Players from './jordan-baseball-1993-94/players.json';
import jordanBaseball1994Teams from './jordan-baseball-1993-94/teams.json';
import jordanBaseball1994Moves from './jordan-baseball-1993-94/offseason_moves.json';
import jordanBaseball1994Draft from './jordan-baseball-1993-94/draft_class.json';
import jordanBack1995Players from './jordan-im-back-1994-95/players.json';
import jordanBack1995Teams from './jordan-im-back-1994-95/teams.json';
import jordanBack1995Moves from './jordan-im-back-1994-95/offseason_moves.json';
import jordanBack1995Draft from './jordan-im-back-1994-95/draft_class.json';
import bulls72101996Players from './bulls-72-10-1995-96/players.json';
import bulls72101996Teams from './bulls-72-10-1995-96/teams.json';
import bulls72101996Moves from './bulls-72-10-1995-96/offseason_moves.json';
import bulls72101996Draft from './bulls-72-10-1995-96/draft_class.json';
import bullsFifth1997Players from './bulls-fifth-ring-1996-97/players.json';
import bullsFifth1997Teams from './bulls-fifth-ring-1996-97/teams.json';
import bullsFifth1997Moves from './bulls-fifth-ring-1996-97/offseason_moves.json';
import bullsFifth1997Draft from './bulls-fifth-ring-1996-97/draft_class.json';
import lastDance1998Players from './last-dance-1997-98/players.json';
import lastDance1998Teams from './last-dance-1997-98/teams.json';
import lastDance1998Moves from './last-dance-1997-98/offseason_moves.json';
import lastDance1998Draft from './last-dance-1997-98/draft_class.json';
// --- Kobe Era (1998-99 .. 2009-10) ---
import spursRing1999Players from './spurs-first-ring-1998-99/players.json';
import spursRing1999Teams from './spurs-first-ring-1998-99/teams.json';
import spursRing1999Moves from './spurs-first-ring-1998-99/offseason_moves.json';
import spursRing1999Draft from './spurs-first-ring-1998-99/draft_class.json';
import shaqMvp2000Players from './shaq-mvp-1999-00/players.json';
import shaqMvp2000Teams from './shaq-mvp-1999-00/teams.json';
import shaqMvp2000Moves from './shaq-mvp-1999-00/offseason_moves.json';
import shaqMvp2000Draft from './shaq-mvp-1999-00/draft_class.json';
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
// data uses, just pointed at a past season instead of today's, with one
// exception: seasons at or before 1995-96 use `--classic` (see below).
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
// (or older) roster has fewer real multi-position combos than a post-2010 one.
//
// Seasons at or before 1995-96 (Magic vs. Bird Era, and most of Jordan Era)
// were pulled with `--classic`: the modern rating pipeline's whole data
// source (leaguedashplayerstats/leaguedashteamstats) returns zero rows that
// far back — not documented anywhere, discovered live — so these use
// `leagueleaders` (real classic box-score coverage back to at least 1959-60)
// and a reweighted attribute model (fetch_data.py's build_attributes(classic=
// True)) instead: ts/efg derived by formula, no PIE/AST%/REB%/hustle/tracking
// signals (none exist this far back), each composite reweighted onto what's
// left rather than diluting on a flat zero. Validated against known history
// before shipping (Bird #1 OVR in his real 1984-85 MVP season, rookie Jordan
// debuting with real, plausible attributes). 1996-97/1997-98 (the tail of
// Jordan Era) are back on the modern (non-classic) pipeline — this is exactly
// where leaguedashplayerstats starts returning real data again.
//
// teams.json names were hand-corrected for franchises that later
// renamed/relocated (New Jersey Nets → Brooklyn, Seattle SuperSonics →
// Oklahoma City, Charlotte Hornets → Bobcats → Hornets again in 2014,
// Charlotte Hornets → New Orleans → Pelicans, San Diego → Los Angeles
// Clippers, Kansas City → Sacramento Kings, Washington Bullets → Wizards) so
// each era shows the name the team actually played under that season; logos
// still use the current franchise crest since no historical crest is hosted
// at the CDN this app pulls from. Several classic-era seasons genuinely have
// fewer than 30 teams (22 in 1979-80, growing to 29 by 1995-96 as Dallas/
// Charlotte/Miami/Minnesota/Orlando/Toronto/Vancouver joined as expansion
// franchises) — the app's standings/playoffs/lottery code already works off
// `teams.length` rather than an assumed 30, so this needed no code change,
// just verification (same as the already-known 29-team 2002-03/2003-04 gap).
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
  // year over year instead of being a single disconnected snapshot. Only the
  // final entry of the whole array (bubble-2019-20) has an empty list — no
  // further season was pulled past it — which is also what any entry naturally
  // degrades to once the user's own moves have diverged the save from real
  // history (each move is skipped individually if it no longer matches current
  // save state). The 1998-99/1999-2000 gap that used to split this array in two
  // (last-dance-1997-98 dead-ending instead of reaching lakers-threepeat-2000-01)
  // was closed by pulling both seasons, so the chain is now unbroken 1979-80 →
  // 2019-20.
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
  // league and their real rating is replayed. Undefined for the last entry of
  // each real chain — the chain naturally goes fully procedural once this
  // runs out, same as offseasonMoves.
  realDraftClass?: { draftYear: string; picks: { overallPick: number; playerId: string | null; playerName: string }[] };
}

// `ERAS` is ONE continuous chronological array spanning all four eras below —
// eraChainIndex (App.tsx) just walks it forward by index, so extending this
// array (in order) is the entire integration cost of adding a new decade; it
// never needed to know about `ERA_GROUPS`. Real continuity is now unbroken from
// 1979-80 to 2019-20 — the old 1998-99/1999-2000 gap is documented as closed on
// `offseasonMoves` above; only the array's final entry runs out of real history.
export const ERAS: EraDefinition[] = [
  // --- Magic vs. Bird Era ---
  {
    id: 'showtime-begins-1979-80',
    label: 'Nasce o Showtime',
    seasonLabel: '1979-80',
    blurb: 'Magic e Bird estreiam na liga — Magic fecha o ano jogando de pivô no Jogo 6 da final (42 pontos) pra dar o título ao Lakers.',
    players: showtime1980Players as unknown as { [key: string]: Player },
    teams: showtime1980Teams as unknown as Team[],
    offseasonMoves: showtime1980Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: showtime1980Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'celtics-first-ring-1980-81',
    label: 'O Primeiro Anel do Bird',
    seasonLabel: '1980-81',
    blurb: 'Celtics batem o Rockets na final e dão o primeiro anel ao Bird, ainda no seu segundo ano de NBA.',
    players: celticsRing1981Players as unknown as { [key: string]: Player },
    teams: celticsRing1981Teams as unknown as Team[],
    offseasonMoves: celticsRing1981Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: celticsRing1981Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'lakers-repeat-1981-82',
    label: 'Bicampeão do Magic',
    seasonLabel: '1981-82',
    blurb: 'Lakers batem o 76ers de novo na final — Magic Johnson é o MVP das finais aos 22 anos.',
    players: lakersRepeat1982Players as unknown as { [key: string]: Player },
    teams: lakersRepeat1982Teams as unknown as Team[],
    offseasonMoves: lakersRepeat1982Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: lakersRepeat1982Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'sixers-fo-fo-fo-1982-83',
    label: 'Fo-Fi-Fo do Moses',
    seasonLabel: '1982-83',
    blurb: 'Moses Malone erra a previsão por 1 jogo (fo-fi-fo, não fo-fo-fo) mas o 76ers vence o título varrendo o Lakers na final.',
    players: sixers1983Players as unknown as { [key: string]: Player },
    teams: sixers1983Teams as unknown as Team[],
    offseasonMoves: sixers1983Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: sixers1983Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'bird-mvp-finals-1983-84',
    label: 'Bird Contra o Magic',
    seasonLabel: '1983-84',
    blurb: 'Primeira final direta entre Magic e Bird — Celtics vence em 7 jogos e Bird é o MVP da temporada e das finais.',
    players: birdMvp1984Players as unknown as { [key: string]: Player },
    teams: birdMvp1984Teams as unknown as Team[],
    offseasonMoves: birdMvp1984Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: birdMvp1984Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'lakers-revenge-1984-85',
    label: 'A Vingança do Lakers',
    seasonLabel: '1984-85',
    blurb: 'Lakers vinga a derrota do ano anterior e bate o Celtics — Kareem, aos 38 anos, é o MVP das finais. Estreia também um novato chamado Michael Jordan.',
    players: lakersRevenge1985Players as unknown as { [key: string]: Player },
    teams: lakersRevenge1985Teams as unknown as Team[],
    offseasonMoves: lakersRevenge1985Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: lakersRevenge1985Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'celtics-greatest-team-1985-86',
    label: 'O Time Perfeito de 86',
    seasonLabel: '1985-86',
    blurb: 'Considerado um dos melhores times da história, o Celtics de Bird (67 vitórias) atropela o Rockets na final.',
    players: celtics1986Players as unknown as { [key: string]: Player },
    teams: celtics1986Teams as unknown as Team[],
    offseasonMoves: celtics1986Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: celtics1986Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'magic-junior-skyhook-1986-87',
    label: 'O Gancho Mágico',
    seasonLabel: '1986-87',
    blurb: 'Magic acerta o "junior, junior skyhook" no fim do Jogo 4 e o Lakers bate o Celtics de novo — Magic é MVP da temporada e das finais.',
    players: magicSkyhook1987Players as unknown as { [key: string]: Player },
    teams: magicSkyhook1987Teams as unknown as Team[],
    offseasonMoves: magicSkyhook1987Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: magicSkyhook1987Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'lakers-back-to-back-1987-88',
    label: 'Bicampeão Depois de Quase 20 Anos',
    seasonLabel: '1987-88',
    blurb: 'Lakers vence o Pistons dos "Bad Boys" em 7 jogos e se torna o primeiro time a ser bicampeão desde 1969.',
    players: lakersBack2back1988Players as unknown as { [key: string]: Player },
    teams: lakersBack2back1988Teams as unknown as Team[],
    offseasonMoves: lakersBack2back1988Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: lakersBack2back1988Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'bad-boys-sweep-1988-89',
    label: 'Os Bad Boys Chegam',
    seasonLabel: '1988-89',
    blurb: 'Pistons varrem o Lakers na final e conquistam o primeiro título dos "Bad Boys". Charlotte e Miami estreiam como franquias de expansão.',
    players: badBoys1989Players as unknown as { [key: string]: Player },
    teams: badBoys1989Teams as unknown as Team[],
    offseasonMoves: badBoys1989Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: badBoys1989Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'pistons-repeat-1989-90',
    label: 'Bicampeonato dos Bad Boys',
    seasonLabel: '1989-90',
    blurb: 'Pistons bate o Portland e fecha o bicampeonato. Minnesota e Orlando estreiam como franquias de expansão.',
    players: pistons1990Players as unknown as { [key: string]: Player },
    teams: pistons1990Teams as unknown as Team[],
    offseasonMoves: pistons1990Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: pistons1990Draft as unknown as EraDefinition['realDraftClass'],
  },
  // --- Jordan Era ---
  {
    id: 'jordan-first-ring-1990-91',
    label: 'O Primeiro Anel do Jordan',
    seasonLabel: '1990-91',
    blurb: 'Bulls batem o Lakers do Magic na final — o primeiro dos seis títulos e do primeiro MVP das finais do Michael Jordan.',
    players: jordanRing1991Players as unknown as { [key: string]: Player },
    teams: jordanRing1991Teams as unknown as Team[],
    offseasonMoves: jordanRing1991Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: jordanRing1991Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'bulls-second-ring-1991-92',
    label: 'O Segundo Anel',
    seasonLabel: '1991-92',
    blurb: 'Bulls batem o Portland na final — inclui o histórico primeiro tempo de 6 bolas de 3 do Jordan contra o Trail Blazers.',
    players: bulls1992Players as unknown as { [key: string]: Player },
    teams: bulls1992Teams as unknown as Team[],
    offseasonMoves: bulls1992Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: bulls1992Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'bulls-threepeat-1992-93',
    label: 'O Primeiro Three-Peat',
    seasonLabel: '1992-93',
    blurb: 'Bulls batem o Phoenix de Charles Barkley na final e fecham o primeiro three-peat da era Jordan.',
    players: bullsThreepeat1993Players as unknown as { [key: string]: Player },
    teams: bullsThreepeat1993Teams as unknown as Team[],
    offseasonMoves: bullsThreepeat1993Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: bullsThreepeat1993Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'jordan-baseball-1993-94',
    label: 'Jordan Vira Jogador de Beisebol',
    seasonLabel: '1993-94',
    blurb: 'Sem o Jordan (aposentado pro beisebol), o Rockets de Hakeem Olajuwon bate o Knicks numa final de 7 jogos.',
    players: jordanBaseball1994Players as unknown as { [key: string]: Player },
    teams: jordanBaseball1994Teams as unknown as Team[],
    offseasonMoves: jordanBaseball1994Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: jordanBaseball1994Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'jordan-im-back-1994-95',
    label: '"I\'m Back"',
    seasonLabel: '1994-95',
    blurb: 'Jordan volta à NBA em março com o famoso comunicado de duas palavras. O Rockets de Hakeem repete o título varrendo o Magic de Shaq e Penny.',
    players: jordanBack1995Players as unknown as { [key: string]: Player },
    teams: jordanBack1995Teams as unknown as Team[],
    offseasonMoves: jordanBack1995Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: jordanBack1995Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'bulls-72-10-1995-96',
    label: '72-10',
    seasonLabel: '1995-96',
    blurb: 'De volta a tempo inteiro, Jordan lidera o Bulls à melhor campanha da história (72-10) e ao quarto título, batendo o Seattle na final.',
    players: bulls72101996Players as unknown as { [key: string]: Player },
    teams: bulls72101996Teams as unknown as Team[],
    offseasonMoves: bulls72101996Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: bulls72101996Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'bulls-fifth-ring-1996-97',
    label: 'O Jogo da Gripe',
    seasonLabel: '1996-97',
    blurb: 'Bulls batem o Utah Jazz de Stockton e Malone — inclui o lendário "jogo da gripe" do Jordan no Jogo 5.',
    players: bullsFifth1997Players as unknown as { [key: string]: Player },
    teams: bullsFifth1997Teams as unknown as Team[],
    offseasonMoves: bullsFifth1997Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: bullsFifth1997Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'last-dance-1997-98',
    label: 'A Última Dança',
    seasonLabel: '1997-98',
    blurb: 'Bulls bate o Jazz de novo na revanche — Jordan fecha com "The Shot" sobre Bryon Russell no Jogo 6, o sexto e último anel daquele elenco.',
    players: lastDance1998Players as unknown as { [key: string]: Player },
    teams: lastDance1998Teams as unknown as Team[],
    offseasonMoves: lastDance1998Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: lastDance1998Draft as unknown as EraDefinition['realDraftClass'],
  },
  // --- Kobe Era ---
  {
    id: 'spurs-first-ring-1998-99',
    label: 'Primeiro Anel dos Spurs',
    seasonLabel: '1998-99',
    blurb: 'Lockout corta a temporada em 50 jogos e Jordan se aposenta — Duncan e Robinson dão o primeiro título aos Spurs, sobre o Knicks, primeiro 8º cabeça a chegar às Finais.',
    players: spursRing1999Players as unknown as { [key: string]: Player },
    teams: spursRing1999Teams as unknown as Team[],
    offseasonMoves: spursRing1999Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: spursRing1999Draft as unknown as EraDefinition['realDraftClass'],
  },
  {
    id: 'shaq-mvp-1999-00',
    label: 'O MVP do Shaq',
    seasonLabel: '1999-00',
    blurb: 'Shaq é MVP quase unânime na estreia de Phil Jackson em LA — o Lakers vira 15 pontos no Jogo 7 contra o Blazers e começa o three-peat.',
    players: shaqMvp2000Players as unknown as { [key: string]: Player },
    teams: shaqMvp2000Teams as unknown as Team[],
    offseasonMoves: shaqMvp2000Moves as unknown as EraDefinition['offseasonMoves'],
    realDraftClass: shaqMvp2000Draft as unknown as EraDefinition['realDraftClass'],
  },
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
    id: 'magic-bird-era',
    label: 'Magic vs. Bird Era',
    spanLabel: '1979-80 → 1989-90',
    blurb: 'Os rookies que salvaram a NBA, cinco títulos do Lakers "Showtime", três do Celtics de Bird e a chegada dos "Bad Boys".',
    visualId: 'magic-bird-era',
    seasonIds: [
      'showtime-begins-1979-80',
      'celtics-first-ring-1980-81',
      'lakers-repeat-1981-82',
      'sixers-fo-fo-fo-1982-83',
      'bird-mvp-finals-1983-84',
      'lakers-revenge-1984-85',
      'celtics-greatest-team-1985-86',
      'magic-junior-skyhook-1986-87',
      'lakers-back-to-back-1987-88',
      'bad-boys-sweep-1988-89',
      'pistons-repeat-1989-90',
    ],
  },
  {
    id: 'jordan-era',
    label: 'Jordan Era',
    spanLabel: '1990-91 → 1997-98',
    blurb: 'Os seis anéis do Bulls, os dois three-peats, a aposentadoria pro beisebol, o "I\'m Back" e o 72-10.',
    visualId: 'jordan-era',
    seasonIds: [
      'jordan-first-ring-1990-91',
      'bulls-second-ring-1991-92',
      'bulls-threepeat-1992-93',
      'jordan-baseball-1993-94',
      'jordan-im-back-1994-95',
      'bulls-72-10-1995-96',
      'bulls-fifth-ring-1996-97',
      'last-dance-1997-98',
    ],
  },
  {
    id: 'kobe-era',
    label: 'Kobe Era',
    spanLabel: '1998-99 → 2009-10',
    blurb: 'O lockout e o primeiro anel dos Spurs, os três anéis do three-peat, o "Fab Four" derrubado pelo Pistons, os 81 pontos e o bicampeonato sem o Shaq.',
    visualId: 'kobe-era',
    seasonIds: [
      'spurs-first-ring-1998-99',
      'shaq-mvp-1999-00',
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
