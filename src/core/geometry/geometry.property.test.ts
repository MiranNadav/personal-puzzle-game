import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { generateEdges } from "./edges";
import { piecePath, type PathCommand } from "./shape";
import { flattenPath, polygonArea } from "./pathUtil";
import type { Vec2 } from "../types";

const CW = 10;
const CH = 11;

function edgeSlices(rows: number, cols: number, r: number, c: number, path: PathCommand[]) {
  const topN = r > 0 ? 3 : 1;
  const rightN = c < cols - 1 ? 3 : 1;
  const bottomN = r < rows - 1 ? 3 : 1;
  const leftN = c > 0 ? 3 : 1;
  let i = 1;
  return {
    top: path.slice(i, (i += topN)),
    right: path.slice(i, (i += rightN)),
    bottom: path.slice(i, (i += bottomN)),
    left: path.slice(i, (i += leftN)),
  };
}

function reversed<T>(a: T[]): T[] {
  return a.slice().reverse();
}

function maxDelta(a: Vec2[], b: Vec2[]): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    m = Math.max(m, Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y));
  }
  return m;
}

describe("geometry invariants hold for random seeds and grids", () => {
  it("edges always pair (the 0.3px-mismatch bug class)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 2, max: 8 }),
        (seed, rows, cols) => {
          const edges = generateEdges(seed, rows, cols);
          const path = (r: number, c: number) => piecePath(edges, r, c, CW, CH);

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols - 1; c++) {
              const right = edgeSlices(rows, cols, r, c, path(r, c)).right;
              const left = edgeSlices(rows, cols, r, c + 1, path(r, c + 1)).left;
              const rp = flattenPath([{ type: "moveTo", x: (c + 1) * CW, y: r * CH }, ...right]);
              // piece (r,c+1)'s left edge starts at ITS bottom-left = the shared line x=(c+1)*CW.
              const lp = flattenPath([{ type: "moveTo", x: (c + 1) * CW, y: (r + 1) * CH }, ...left]);
              expect(maxDelta(rp, reversed(lp))).toBeLessThan(1e-9);
            }
          }
          for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols; c++) {
              const bottom = edgeSlices(rows, cols, r, c, path(r, c)).bottom;
              const top = edgeSlices(rows, cols, r + 1, c, path(r + 1, c)).top;
              const bp = flattenPath([{ type: "moveTo", x: (c + 1) * CW, y: (r + 1) * CH }, ...bottom]);
              const tp = flattenPath([{ type: "moveTo", x: c * CW, y: (r + 1) * CH }, ...top]);
              expect(maxDelta(bp, reversed(tp))).toBeLessThan(1e-9);
            }
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it("pieces always tile the source rect", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 2, max: 7 }),
        fc.integer({ min: 2, max: 7 }),
        (seed, rows, cols) => {
          const edges = generateEdges(seed, rows, cols);
          let total = 0;
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
              total += Math.abs(polygonArea(flattenPath(piecePath(edges, r, c, CW, CH), 48)));
          const rectArea = rows * CH * cols * CW;
          expect(total).toBeGreaterThan(rectArea * 0.998);
          expect(total).toBeLessThan(rectArea * 1.002);
        },
      ),
      { numRuns: 80 },
    );
  });
});
