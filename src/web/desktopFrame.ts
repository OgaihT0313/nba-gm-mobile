// PC / browser build: the game is laid out for a phone held upright, so on a
// wide screen it would stretch edge to edge (a 1400px-wide roster row, the
// "Nova carreira" button across the whole monitor). Instead the app lives in a
// centered phone-width column. React Native Web's <Modal> portals into its own
// <div> under <body>, outside #root, so those get the same column; the
// transform makes the modal's position:fixed content anchor to that column
// instead of the viewport. Portal hosts can sit empty (a closed modal), so
// the host itself never takes clicks -- only what is rendered inside it.
const FRAME_WIDTH = 520;

const CSS = `
@media (min-width: ${FRAME_WIDTH + 80}px) {
  html, body { background: #050506; }
  #root {
    max-width: ${FRAME_WIDTH}px;
    width: 100%;
    margin: 0 auto;
    transform: translateZ(0);
    box-shadow: 0 0 0 1px #1c1c21, 0 0 60px rgba(0, 0, 0, 0.6);
  }
  body > div:not(#root) {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 50%;
    width: ${FRAME_WIDTH}px;
    margin-left: -${FRAME_WIDTH / 2}px;
    transform: translateZ(0);
    z-index: 9999;
    pointer-events: none;
  }
  body > div:not(#root) > * { pointer-events: auto; }
}
`;

export function installDesktopFrame() {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.id = 'desktop-frame';
  style.textContent = CSS;
  document.head.appendChild(style);
}
