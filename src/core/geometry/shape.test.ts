import { describe, it, expect } from "vitest";
import { generateEdges } from "./edges";
import { piecePath, type PathCommand } from "./shape";
import { flattenPath, polygonArea } from "./pathUtil";
import type { Vec2 } from "../types";

const CW = 10;
const CH = 12;

/** Split a piece path into its four edge command lists (top,right,bottom,left). */
function edgeSlices(rows: number, cols: number, r: number, c: number, path: PathCommand[]) {
  const topN = r > 0 ? 3 : 1;
  const rightN = c < cols - 1 ? 3 : 1;
  const bottomN = r < rows - 1 ? 3 : 1;
  const leftN = c > 0 ? 3 : 1;
  let i = 1; // skip initial moveTo
  const top = path.slice(i, (i += topN));
  const right = path.slice(i, (i += rightN));
  const bottom = path.slice(i, (i += bottomN));
  const left = path.slice(i, (i += leftN));
  return { top, right, bottom, left };
}

/** Flatten one edge into a polyline, seeded by its starting corner. */
function edgePolyline(start: Vec2, cmds: PathCommand[]): Vec2[] {
  return flattenPath([{ type: "moveTo", x: start.x, y: start.y }, ...cmds]);
}

function corner(r: number, c: number, which: "TL" | "TR" | "BR" | "BL"): Vec2 {
  const x0 = c * CW;
  const y0 = r * CH;
  const x1 = (c + 1) * CW;
  const y1 = (r + 1) * CH;
  return { TL: { x: x0, y: y0 }, TR: { x: x1, y: y0 }, BR: { x: x1, y: y1 }, BL: { x: x0, y: y1 } }[which];
}

function approxEqual(a: Vec2[], b: Vec2[], eps = 1e-9) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(Math.abs(a[i].x - b[i].x)).toBeLessThan(eps);
    expect(Math.abs(a[i].y - b[i].y)).toBeLessThan(eps);
  }
}

describe("piece geometry determinism", () => {
  it("same (seed,rows,cols) yields byte-identical paths", () => {
    const e1 = generateEdges(12345, 5, 7);
    const e2 = generateEdges(12345, 5, 7);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        expect(piecePath(e1, r, c, CW, CH)).toEqual(piecePath(e2, r, c, CW, CH));
      }
    }
  });

  it("different seeds diverge", () => {
    const a = piecePath(generateEdges(1, 5, 7), 2, 3, CW, CH);
    const b = piecePath(generateEdges(2, 5, 7), 2, 3, CW, CH);
    expect(a).not.toEqual(b);
  });
});

describe("edge pairing invariant", () => {
  it("each interior edge is the exact inverse of its neighbour's facing edge", () => {
    const rows = 4;
    const cols = 6;
    const edges = generateEdges(999, rows, cols);
    const paths = new Map<string, PathCommand[]>();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) paths.set(`${r},${c}`, piecePath(edges, r, c, CW, CH));

    // Vertical shared edges: (r,c) right == reverse of (r,c+1) left.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const right = edgeSlices(rows, cols, r, c, paths.get(`${r},${c}`)!).right;
        const left = edgeSlices(rows, cols, r, c + 1, paths.get(`${r},${c + 1}`)!).left;
        const rp = edgePolyline(corner(r, c, "TR"), right);
        const lp = edgePolyline(corner(r, c + 1, "BL"), left);
        approxEqual(rp, lp.slice().reverse());
      }
    }

    // Horizontal shared edges: (r,c) bottom == reverse of (r+1,c) top.
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const bottom = edgeSlices(rows, cols, r, c, paths.get(`${r},${c}`)!).bottom;
        const top = edgeSlices(rows, cols, r + 1, c, paths.get(`${r + 1},${c}`)!).top;
        const bp = edgePolyline(corner(r, c, "BR"), bottom);
        const tp = edgePolyline(corner(r + 1, c, "TL"), top);
        approxEqual(bp, tp.slice().reverse());
      }
    }
  });
});

describe("tiling", () => {
  it("piece bodies exactly cover the source rect (areas sum, no gaps/overlap)", () => {
    const rows = 4;
    const cols = 5;
    const edges = generateEdges(42, rows, cols);
    let total = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        total += Math.abs(polygonArea(flattenPath(piecePath(edges, r, c, CW, CH), 40)));
      }
    }
    const rectArea = rows * CH * cols * CW;
    // Tabs of one piece are blanks of its neighbour, so the summed body area
    // equals the plain rect. Tolerance covers bezier-flattening discretization.
    expect(total).toBeGreaterThan(rectArea * 0.999);
    expect(total).toBeLessThan(rectArea * 1.001);
  });

  it("border edges are straight on the rect boundary", () => {
    const rows = 3;
    const cols = 3;
    const edges = generateEdges(7, rows, cols);
    const path = piecePath(edges, 0, 0, CW, CH);
    // Piece (0,0): top and left are borders -> single lineTo each.
    const { top, left } = edgeSlices(rows, cols, 0, 0, path);
    expect(top).toEqual([{ type: "lineTo", x: CW, y: 0 }]);
    expect(left).toEqual([{ type: "lineTo", x: 0, y: 0 }]);
  });
});
