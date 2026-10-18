// Who a franchise WAS in a given season: the Seattle SuperSonics until 2008,
// the New Jersey Nets until 2012, the Washington Bullets until 1997... In an
// era save the team ids are today's (okc, bkn, was), so every place that
// names or colors a team asks here first, with the season on screen
// (setEraYear, set by App / CareerApp from the save). Outside an era save
// (the live league) nothing changes.
//
// Pure data: no images here (src/eraLogos.ts has those, read by the UI), so
// constants.ts and the Node check scripts can import this.

export interface EraIdentity {
  name: string;
  city: string;
  nickname: string;
  tricode: string;
  primary: string;
  secondary: string;
}

/** Season END year (1985 = 1984-85) of the era save on screen; null = the live league. */
let currentYear: number | null = null;
export const setEraYear = (year: number | null) => { currentYear = year; };
export const eraYear = () => currentYear;

/** Each franchise's former identities, by the last season (end year) they were used. */
const HISTORIC: Record<string, { from?: number; until: number; id: EraIdentity }[]> = {
  okc: [{ until: 2008, id: { name: 'Seattle SuperSonics', city: 'Seattle', nickname: 'SuperSonics', tricode: 'SEA', primary: '#00653A', secondary: '#FFC200' } }],
  bkn: [{ until: 2012, id: { name: 'New Jersey Nets', city: 'New Jersey', nickname: 'Nets', tricode: 'NJN', primary: '#002A60', secondary: '#CD1041' } }],
  was: [{ until: 1997, id: { name: 'Washington Bullets', city: 'Washington', nickname: 'Bullets', tricode: 'WSB', primary: '#E31837', secondary: '#002B5C' } }],
  mem: [{ until: 2001, id: { name: 'Vancouver Grizzlies', city: 'Vancouver', nickname: 'Grizzlies', tricode: 'VAN', primary: '#00B2A9', secondary: '#BC7844' } }],
  sac: [{ until: 1985, id: { name: 'Kansas City Kings', city: 'Kansas City', nickname: 'Kings', tricode: 'KCK', primary: '#1D428A', secondary: '#E03A3E' } }],
  lac: [{ until: 1984, id: { name: 'San Diego Clippers', city: 'San Diego', nickname: 'Clippers', tricode: 'SDC', primary: '#1F6FB8', secondary: '#F26722' } }],
  nop: [
    { from: 2006, until: 2007, id: { name: 'New Orleans/Oklahoma City Hornets', city: 'New Orleans/OKC', nickname: 'Hornets', tricode: 'NOK', primary: '#00788C', secondary: '#1D1160' } },
    { from: 2003, until: 2013, id: { name: 'New Orleans Hornets', city: 'New Orleans', nickname: 'Hornets', tricode: 'NOH', primary: '#00788C', secondary: '#1D1160' } },
  ],
  cha: [{ from: 2005, until: 2014, id: { name: 'Charlotte Bobcats', city: 'Charlotte', nickname: 'Bobcats', tricode: 'CHA', primary: '#F26532', secondary: '#2C5EAC' } }],
};

/** The franchise's identity in that season, or null when it is today's. */
export const eraIdentity = (teamId: string | undefined | null, year: number | null = currentYear): EraIdentity | null => {
  if (!teamId || year === null) return null;
  const list = HISTORIC[teamId];
  if (!list) return null;
  const hit = list.find((h) => year <= h.until && (h.from === undefined || year >= h.from));
  return hit ? hit.id : null;
};

/** The team's full name that season: the historic one, or `current`. */
export const teamNameFor = (teamId: string, year: number | null, current: string): string =>
  eraIdentity(teamId, year)?.name ?? current;
