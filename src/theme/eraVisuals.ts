// Per-Era-Group visual identity — deliberately narrow scope (see the plan):
// NOT a reskin of the whole app (that's already covered by ThemeProvider's
// per-team accent), just the accent used on the era-group cards in
// EraSelect.tsx and the floor tone Court3D renders during "Assistir ao Jogo"
// for a save that started in that era. Same flat-lookup-plus-pure-function
// shape as TEAM_COLORS/getTeamAccent in constants.ts.
//
// `floorTone` deliberately stays close to Court3D's existing hardcoded
// '#b5793f' for the live/no-era case (not present here at all — a save
// without an era passes no `visual` prop, so Court3D's own default applies
// unchanged) — the Kobe Era gets a visibly warmer/more saturated wood tone as
// its one piece of "old broadcast" flavor; LeBron/Warriors Era intentionally
// matches the modern default almost exactly, since it's the same on-court
// look the live game already ships.
export interface EraVisual {
  accentPrimary: string;
  accentSecondary: string;
  floorTone: string;
}

export const ERA_VISUALS: { [visualId: string]: EraVisual } = {
  'magic-bird-era': {
    accentPrimary: '#007A33', // Celtics green — the rivalry's other half of Lakers purple (used by Kobe Era below)
    accentSecondary: '#BA9653', // Celtics gold
    floorTone: '#8a5a2e', // the oldest/darkest retro wood of the four eras
  },
  'jordan-era': {
    accentPrimary: '#CE1141', // Bulls red
    accentSecondary: '#000000', // Bulls black
    floorTone: '#93602c', // between Magic vs. Bird's and Kobe Era's tones, chronologically
  },
  'kobe-era': {
    accentPrimary: '#552583', // Lakers purple — the decade's defining color
    accentSecondary: '#FDB927', // Lakers gold
    floorTone: '#9c5f28', // warmer/more saturated than the modern default, "old broadcast" wood
  },
  'lebron-warriors-era': {
    accentPrimary: '#1D428A', // Warriors blue — 6 of the 10 seasons are the Warriors dynasty
    accentSecondary: '#FFC72C', // Warriors gold
    floorTone: '#b5793f', // matches Court3D's modern default — this era already looks like "now"
  },
};

export const getEraVisual = (visualId: string | undefined): EraVisual | undefined =>
  visualId ? ERA_VISUALS[visualId] : undefined;
