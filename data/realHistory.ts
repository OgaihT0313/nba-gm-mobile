// What really happened, season by season (E4 of the ROADMAP): the champion,
// the team it beat in the Finals, the MVP and the Finals MVP. Keyed by the
// season's END year (1980 = 1979-80), with today's team ids: the Sonics are
// okc, the Nets bkn, the Bullets was (src/eraIdentity names them per season).
// Shown next to the save's own history and before it starts (Legado), and
// when an era save crowns its champion.

export interface RealSeason {
  champion: string;
  runnerUp: string;
  mvp: string;
  finalsMvp: string;
}

export const REAL_SEASONS: Record<number, RealSeason> = {
  1980: { champion: 'lal', runnerUp: 'phi', mvp: 'Kareem Abdul-Jabbar', finalsMvp: 'Magic Johnson' },
  1981: { champion: 'bos', runnerUp: 'hou', mvp: 'Julius Erving', finalsMvp: 'Cedric Maxwell' },
  1982: { champion: 'lal', runnerUp: 'phi', mvp: 'Moses Malone', finalsMvp: 'Magic Johnson' },
  1983: { champion: 'phi', runnerUp: 'lal', mvp: 'Moses Malone', finalsMvp: 'Moses Malone' },
  1984: { champion: 'bos', runnerUp: 'lal', mvp: 'Larry Bird', finalsMvp: 'Larry Bird' },
  1985: { champion: 'lal', runnerUp: 'bos', mvp: 'Larry Bird', finalsMvp: 'Kareem Abdul-Jabbar' },
  1986: { champion: 'bos', runnerUp: 'hou', mvp: 'Larry Bird', finalsMvp: 'Larry Bird' },
  1987: { champion: 'lal', runnerUp: 'bos', mvp: 'Magic Johnson', finalsMvp: 'Magic Johnson' },
  1988: { champion: 'lal', runnerUp: 'det', mvp: 'Michael Jordan', finalsMvp: 'James Worthy' },
  1989: { champion: 'det', runnerUp: 'lal', mvp: 'Magic Johnson', finalsMvp: 'Joe Dumars' },
  1990: { champion: 'det', runnerUp: 'por', mvp: 'Magic Johnson', finalsMvp: 'Isiah Thomas' },
  1991: { champion: 'chi', runnerUp: 'lal', mvp: 'Michael Jordan', finalsMvp: 'Michael Jordan' },
  1992: { champion: 'chi', runnerUp: 'por', mvp: 'Michael Jordan', finalsMvp: 'Michael Jordan' },
  1993: { champion: 'chi', runnerUp: 'phx', mvp: 'Charles Barkley', finalsMvp: 'Michael Jordan' },
  1994: { champion: 'hou', runnerUp: 'nyk', mvp: 'Hakeem Olajuwon', finalsMvp: 'Hakeem Olajuwon' },
  1995: { champion: 'hou', runnerUp: 'orl', mvp: 'David Robinson', finalsMvp: 'Hakeem Olajuwon' },
  1996: { champion: 'chi', runnerUp: 'okc', mvp: 'Michael Jordan', finalsMvp: 'Michael Jordan' },
  1997: { champion: 'chi', runnerUp: 'uta', mvp: 'Karl Malone', finalsMvp: 'Michael Jordan' },
  1998: { champion: 'chi', runnerUp: 'uta', mvp: 'Michael Jordan', finalsMvp: 'Michael Jordan' },
  1999: { champion: 'sas', runnerUp: 'nyk', mvp: 'Karl Malone', finalsMvp: 'Tim Duncan' },
  2000: { champion: 'lal', runnerUp: 'ind', mvp: "Shaquille O'Neal", finalsMvp: "Shaquille O'Neal" },
  2001: { champion: 'lal', runnerUp: 'phi', mvp: 'Allen Iverson', finalsMvp: "Shaquille O'Neal" },
  2002: { champion: 'lal', runnerUp: 'bkn', mvp: 'Tim Duncan', finalsMvp: "Shaquille O'Neal" },
  2003: { champion: 'sas', runnerUp: 'bkn', mvp: 'Tim Duncan', finalsMvp: 'Tim Duncan' },
  2004: { champion: 'det', runnerUp: 'lal', mvp: 'Kevin Garnett', finalsMvp: 'Chauncey Billups' },
  2005: { champion: 'sas', runnerUp: 'det', mvp: 'Steve Nash', finalsMvp: 'Tim Duncan' },
  2006: { champion: 'mia', runnerUp: 'dal', mvp: 'Steve Nash', finalsMvp: 'Dwyane Wade' },
  2007: { champion: 'sas', runnerUp: 'cle', mvp: 'Dirk Nowitzki', finalsMvp: 'Tony Parker' },
  2008: { champion: 'bos', runnerUp: 'lal', mvp: 'Kobe Bryant', finalsMvp: 'Paul Pierce' },
  2009: { champion: 'lal', runnerUp: 'orl', mvp: 'LeBron James', finalsMvp: 'Kobe Bryant' },
  2010: { champion: 'lal', runnerUp: 'bos', mvp: 'LeBron James', finalsMvp: 'Kobe Bryant' },
  2011: { champion: 'dal', runnerUp: 'mia', mvp: 'Derrick Rose', finalsMvp: 'Dirk Nowitzki' },
  2012: { champion: 'mia', runnerUp: 'okc', mvp: 'LeBron James', finalsMvp: 'LeBron James' },
  2013: { champion: 'mia', runnerUp: 'sas', mvp: 'LeBron James', finalsMvp: 'LeBron James' },
  2014: { champion: 'sas', runnerUp: 'mia', mvp: 'Kevin Durant', finalsMvp: 'Kawhi Leonard' },
  2015: { champion: 'gsw', runnerUp: 'cle', mvp: 'Stephen Curry', finalsMvp: 'Andre Iguodala' },
  2016: { champion: 'cle', runnerUp: 'gsw', mvp: 'Stephen Curry', finalsMvp: 'LeBron James' },
  2017: { champion: 'gsw', runnerUp: 'cle', mvp: 'Russell Westbrook', finalsMvp: 'Kevin Durant' },
  2018: { champion: 'gsw', runnerUp: 'cle', mvp: 'James Harden', finalsMvp: 'Kevin Durant' },
  2019: { champion: 'tor', runnerUp: 'gsw', mvp: 'Giannis Antetokounmpo', finalsMvp: 'Kawhi Leonard' },
  2020: { champion: 'lal', runnerUp: 'mia', mvp: 'Giannis Antetokounmpo', finalsMvp: 'LeBron James' },
  2021: { champion: 'mil', runnerUp: 'phx', mvp: 'Nikola Jokić', finalsMvp: 'Giannis Antetokounmpo' },
  2022: { champion: 'gsw', runnerUp: 'bos', mvp: 'Nikola Jokić', finalsMvp: 'Stephen Curry' },
  2023: { champion: 'den', runnerUp: 'mia', mvp: 'Joel Embiid', finalsMvp: 'Nikola Jokić' },
  2024: { champion: 'bos', runnerUp: 'dal', mvp: 'Nikola Jokić', finalsMvp: 'Jaylen Brown' },
  2025: { champion: 'okc', runnerUp: 'ind', mvp: 'Shai Gilgeous-Alexander', finalsMvp: 'Shai Gilgeous-Alexander' },
};

/** The real season ending in `endYear`, if it's one we know (it hasn't been played yet past 2025). */
export const realSeason = (endYear: number): RealSeason | undefined => REAL_SEASONS[endYear];
