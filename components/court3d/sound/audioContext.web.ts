// The browser's own Web Audio (see audioContext.ts for the phone's).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createAudioContext = (): any => {
  if (typeof window === 'undefined') return null;
  const C = (window as any).AudioContext || (window as any).webkitAudioContext;
  return C ? new C() : null;
};
