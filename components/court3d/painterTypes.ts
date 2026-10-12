/** The few 2D operations the rich textures need (see painter.ts). Coordinates
 *  are canvas pixels, y down; pixels() returns RGBA rows top first. */
export interface Painter {
  w: number;
  h: number;
  rect: (x: number, y: number, w: number, h: number, color: string) => void;
  /** A filled polygon, as x0,y0,x1,y1,... */
  poly: (points: number[], color: string) => void;
  /** Text centered on x (or starting at x), baseline at y. */
  text: (str: string, x: number, y: number, size: number, color: string,
    opts?: { stroke?: string; strokeWidth?: number; align?: 'center' | 'left' }) => void;
  textWidth: (str: string, size: number) => number;
  pixels: () => Uint8Array | null;
}
