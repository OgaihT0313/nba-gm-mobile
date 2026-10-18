// One 60 Hz frame clock for the "Assistir ao Jogo" screen: the playback tick
// (which writes courtRef) and the 3D render both run off it, in that order,
// on the same vsync.
//
// The phone's screen refreshes at 120 Hz. Left to its own rAF the scene
// rendered whenever it could, so frames came out 8, 17 and 25 ms apart and
// the motion looked rough even at ~90 fps (device audit, 2026-10-18). Every
// other vsync, steadily, reads smoother and halves the GPU's work. On a 60 Hz
// screen this runs every frame; at 90 Hz it averages 60.
const FRAME_MS = 1000 / 60;
// rAF timestamps jitter by a few ms; a vsync this close to the slot counts.
const SLACK_MS = 4;

type Sub = { fn: (t: number) => void; order: number };
const subs: Sub[] = [];
let raf = 0;
let next = 0;

function tick(t: number) {
  raf = requestAnimationFrame(tick);
  if (t < next - SLACK_MS) return;
  // Behind by more than a frame (a hitch, the app coming back): start over
  // from now rather than rushing to catch up.
  next = t - next > FRAME_MS ? t + FRAME_MS : next + FRAME_MS;
  for (const s of subs.slice()) s.fn(t);
}

/** Runs fn on each paced frame (lower order first); returns the unsubscribe. */
export function onPacedFrame(fn: (t: number) => void, order = 0): () => void {
  const sub = { fn, order };
  subs.push(sub);
  subs.sort((a, b) => a.order - b.order);
  if (!raf) { next = 0; raf = requestAnimationFrame(tick); }
  return () => {
    const i = subs.indexOf(sub);
    if (i !== -1) subs.splice(i, 1);
    if (!subs.length && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
}
