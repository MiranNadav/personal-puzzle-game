import { makeRng, type Rng } from "../rng";

/**
 * Jitter parameters + tab direction for one interior edge. These are the only
 * per-edge state; the actual curve is derived from them in `shape.ts`. Border
 * edges have no `EdgeParams` — they are straight lines.
 */
export interface EdgeParams {
  /** +1 tab on one side, -1 the other. Which piece "owns" the tab. */
  flip: 1 | -1;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

/**
 * All interior edges of a grid, generated once and indexed so neighbours share
 * the identical edge.
 *
 *   vertical[r][c]   — the grid line between piece (r,c) and (r,c+1).
 *                      Owned as (r,c)'s RIGHT edge and (r,c+1)'s LEFT edge.
 *                      Indices: r in [0,rows), c in [0,cols-1).
 *   horizontal[r][c] — the grid line between piece (r,c) and (r+1,c).
 *                      Owned as (r,c)'s BOTTOM edge and (r+1,c)'s TOP edge.
 *                      Indices: r in [0,rows-1), c in [0,cols).
 *
 * Sharing (not per-piece regeneration) is what guarantees pieces actually fit:
 * a tab and its mating blank are literally the same curve (plan Q5).
 */
export interface EdgeGrid {
  rows: number;
  cols: number;
  vertical: EdgeParams[][];
  horizontal: EdgeParams[][];
}

const JITTER = 0.04;

function makeEdge(rng: Rng): EdgeParams {
  return {
    flip: rng.bool() ? 1 : -1,
    a: rng.uniform(-JITTER, JITTER),
    b: rng.uniform(-JITTER, JITTER),
    c: rng.uniform(-JITTER, JITTER),
    d: rng.uniform(-JITTER, JITTER),
    e: rng.uniform(-JITTER, JITTER),
  };
}

/**
 * Generate the shared interior edges for `(seed, rows, cols)`.
 *
 * Determinism is load-bearing: the RNG is consumed in a fixed order (all
 * vertical edges row-major, then all horizontal), so the same inputs yield
 * byte-identical params on any machine.
 */
export function generateEdges(seed: number, rows: number, cols: number): EdgeGrid {
  const rng = makeRng(seed);

  const vertical: EdgeParams[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowEdges: EdgeParams[] = [];
    for (let c = 0; c < cols - 1; c++) rowEdges.push(makeEdge(rng));
    vertical.push(rowEdges);
  }

  const horizontal: EdgeParams[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    const rowEdges: EdgeParams[] = [];
    for (let c = 0; c < cols; c++) rowEdges.push(makeEdge(rng));
    horizontal.push(rowEdges);
  }

  return { rows, cols, vertical, horizontal };
}
