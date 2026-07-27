import type { Vec2 } from "../types";
import type { EdgeGrid, EdgeParams } from "./edges";

/**
 * Abstract path commands — deliberately NOT `THREE.Shape`. Keeping the outline
 * as plain data is the invariant that keeps `core/` framework-free (plan Q15);
 * the `render/` layer translates these into a `THREE.Shape`, and the same data
 * can drive a server-side thumbnail or a 2D fallback.
 *
 * Coordinates are absolute solved-puzzle space, y-DOWN (image space): cell
 * (r,c) occupies x in [c*cellW,(c+1)*cellW], y in [r*cellH,(r+1)*cellH]. Tabs
 * extend beyond the cell.
 */
export type PathCommand =
  | { type: "moveTo"; x: number; y: number }
  | { type: "lineTo"; x: number; y: number }
  | {
      type: "bezierTo";
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x: number;
      y: number;
    };

/** Fraction of edge length the tab reaches / neck width (matches jitter scale). */
const TAB = 0.2;

interface Bezier {
  p0: Vec2;
  c1: Vec2;
  c2: Vec2;
  p3: Vec2;
}

/** One cubic segment, endpoints/controls in local (along, perp) unit space. */
interface LocalSeg {
  c1: Vec2;
  c2: Vec2;
  end: Vec2;
}

/**
 * The three cubic segments of a tab curve in local space: `along` in [0,1],
 * `perp` is the tab excursion (sign folded in via `flip`). Constants produce the
 * classic pinched-neck round-head knob.
 */
function localTabSegments(p: EdgeParams): LocalSeg[] {
  const { a, b, c, d, e, flip } = p;
  const w = (v: number) => v * flip;
  return [
    {
      c1: { x: 0.2, y: w(a) },
      c2: { x: 0.5 + b + d, y: w(-TAB + c) },
      end: { x: 0.5 - TAB + b, y: w(TAB + c) },
    },
    {
      c1: { x: 0.5 - 2 * TAB + b - d, y: w(3 * TAB + c) },
      c2: { x: 0.5 + 2 * TAB + b - d, y: w(3 * TAB + c) },
      end: { x: 0.5 + TAB + b, y: w(TAB + c) },
    },
    {
      c1: { x: 0.5 + b + d, y: w(-TAB + c) },
      c2: { x: 0.8, y: w(e) },
      end: { x: 1, y: 0 },
    },
  ];
}

/** Map a local (along, perp) point into world coords along the S->E edge. */
function toWorld(s: Vec2, along: Vec2, normal: Vec2, len: number, l: number, wv: number): Vec2 {
  return {
    x: s.x + along.x * (l * len) + normal.x * (wv * len),
    y: s.y + along.y * (l * len) + normal.y * (wv * len),
  };
}

/** Build the world-space cubic beziers for an interior edge from S to E. */
function edgeBeziers(s: Vec2, e: Vec2, params: EdgeParams): Bezier[] {
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.hypot(dx, dy);
  const along: Vec2 = { x: dx / len, y: dy / len };
  // Normal: rotate `along` +90° (screen/image space). Consistent choice is all
  // that matters — the shared edge uses the same S,E,params for both pieces.
  const normal: Vec2 = { x: -along.y, y: along.x };

  let prev: Vec2 = s; // local (0,0)
  const segs = localTabSegments(params);
  return segs.map((seg) => {
    const c1 = toWorld(s, along, normal, len, seg.c1.x, seg.c1.y);
    const c2 = toWorld(s, along, normal, len, seg.c2.x, seg.c2.y);
    const p3 = toWorld(s, along, normal, len, seg.end.x, seg.end.y);
    const bez: Bezier = { p0: prev, c1, c2, p3 };
    prev = p3;
    return bez;
  });
}

/** Reverse a chain of beziers so it runs end->start (swap controls, flip order). */
function reverseBeziers(bez: Bezier[]): Bezier[] {
  return bez
    .slice()
    .reverse()
    .map((b) => ({ p0: b.p3, c1: b.c2, c2: b.c1, p3: b.p0 }));
}

/**
 * Append one edge (S -> E) to the command list. Interior edges pull their shared
 * `EdgeParams`; `reversed` is set when the piece traverses the shared edge
 * against its canonical direction (bottom & left edges), so both pieces emit the
 * identical world curve and therefore mate exactly.
 */
function appendEdge(
  cmds: PathCommand[],
  s: Vec2,
  e: Vec2,
  params: EdgeParams | null,
  reversed: boolean,
): void {
  if (!params) {
    cmds.push({ type: "lineTo", x: e.x, y: e.y });
    return;
  }
  // Build canonically (from the lower-index corner) then reverse if needed, so
  // the curve is a pure function of the shared edge, not the traversal order.
  const canonS = reversed ? e : s;
  const canonE = reversed ? s : e;
  let bez = edgeBeziers(canonS, canonE, params);
  if (reversed) bez = reverseBeziers(bez);
  for (const b of bez) {
    cmds.push({
      type: "bezierTo",
      c1x: b.c1.x,
      c1y: b.c1.y,
      c2x: b.c2.x,
      c2y: b.c2.y,
      x: b.p3.x,
      y: b.p3.y,
    });
  }
}

/**
 * The closed outline of piece (r,c) as path commands in absolute solved-puzzle
 * space. Traversed clockwise: TL -> top -> TR -> right -> BR -> bottom -> BL ->
 * left -> TL.
 *
 * Edge ownership (shared, generated once in `edges.ts`):
 *   top    = horizontal[r-1][c]  forward   (border if r == 0)
 *   right  = vertical[r][c]      forward   (border if c == cols-1)
 *   bottom = horizontal[r][c]    reversed  (border if r == rows-1)
 *   left   = vertical[r][c-1]    reversed  (border if c == 0)
 */
export function piecePath(
  edges: EdgeGrid,
  row: number,
  col: number,
  cellW: number,
  cellH: number,
): PathCommand[] {
  const { rows, cols } = edges;
  const x0 = col * cellW;
  const y0 = row * cellH;
  const x1 = (col + 1) * cellW;
  const y1 = (row + 1) * cellH;

  const TL: Vec2 = { x: x0, y: y0 };
  const TR: Vec2 = { x: x1, y: y0 };
  const BR: Vec2 = { x: x1, y: y1 };
  const BL: Vec2 = { x: x0, y: y1 };

  const top = row > 0 ? edges.horizontal[row - 1][col] : null;
  const right = col < cols - 1 ? edges.vertical[row][col] : null;
  const bottom = row < rows - 1 ? edges.horizontal[row][col] : null;
  const left = col > 0 ? edges.vertical[row][col - 1] : null;

  const cmds: PathCommand[] = [{ type: "moveTo", x: TL.x, y: TL.y }];
  appendEdge(cmds, TL, TR, top, false); // top: canonical L->R, forward
  appendEdge(cmds, TR, BR, right, false); // right: canonical T->B, forward
  appendEdge(cmds, BR, BL, bottom, true); // bottom: canonical L->R, reversed
  appendEdge(cmds, BL, TL, left, true); // left: canonical T->B, reversed
  return cmds;
}

/** Center of cell (r,c) in absolute solved-puzzle space (y-down). */
export function cellCenter(row: number, col: number, cellW: number, cellH: number): Vec2 {
  return { x: (col + 0.5) * cellW, y: (row + 0.5) * cellH };
}
