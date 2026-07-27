import { describe, it, expect } from "vitest";
import type { PuzzleSpec } from "../types";
import {
  createGameState,
  placePieces,
  piecePosition,
  pieceOffset,
  type GameState,
} from "./state";
import { mergeGroups, groupOf } from "./groups";
import { applyDrop, snapThreshold, neighborPieces } from "./snap";
import { isComplete, progress, groupCount } from "./complete";
import { scatterPositions } from "./scatter";
import { serialize, deserialize } from "./serialize";

const SPEC: PuzzleSpec = { rows: 2, cols: 2, seed: 5, cellW: 10, cellH: 10 };

function freshSolved(): GameState {
  return createGameState(SPEC);
}

describe("state factory", () => {
  it("starts as N loose groups at their solved positions", () => {
    const s = freshSolved();
    expect(groupCount(s)).toBe(4);
    // origin 0 for all -> pieces sit at their cell centers (assembled look).
    expect(piecePosition(s, 0)).toEqual(pieceOffset(s, 0));
    expect(progress(s)).toBe(0);
    expect(isComplete(s)).toBe(false);
  });
});

describe("neighbors", () => {
  it("returns grid-adjacent pieces, bounds-checked", () => {
    const s = freshSolved();
    expect(neighborPieces(s, 0).sort()).toEqual([1, 2]); // (0,0) -> right, down
    expect(neighborPieces(s, 3).sort()).toEqual([1, 2]); // (1,1) -> up, left
  });
});

describe("union-find / mergeGroups", () => {
  it("reparents pieces and drops the merged group", () => {
    const s = freshSolved();
    mergeGroups(s, groupOf(s, 0), groupOf(s, 1));
    expect(groupOf(s, 0)).toBe(groupOf(s, 1));
    expect(groupCount(s)).toBe(3);
    expect(s.groups.get(groupOf(s, 0))!.pieces).toEqual([0, 1]);
  });
});

describe("snap on drop", () => {
  it("does not snap when no neighbour is within threshold", () => {
    const s = freshSolved();
    // Shove piece 0's group far away.
    s.groups.get(groupOf(s, 0))!.origin = { x: 100, y: 100 };
    const res = applyDrop(s, groupOf(s, 0), snapThreshold(s));
    expect(res.merged).toBe(false);
    expect(groupCount(s)).toBe(4);
  });

  it("snaps into place when dropped near an aligned neighbour", () => {
    const s = freshSolved();
    const g0 = groupOf(s, 0);
    // Others remain at origin 0 (aligned); nudge piece 0 within threshold.
    s.groups.get(g0)!.origin = { x: 1, y: -1 }; // |.| < 2 = 0.2*10
    const res = applyDrop(s, g0, snapThreshold(s));
    expect(res.merged).toBe(true);
    // Cascade pulls the whole aligned cluster together.
    expect(isComplete(s)).toBe(true);
    // Snapped exactly onto the solved origin.
    expect(s.groups.get(res.groupId)!.origin).toEqual({ x: 0, y: 0 });
  });

  it("joins two loose pieces without completing the puzzle", () => {
    const s = freshSolved();
    // Scatter each piece far apart first.
    placePieces(s, [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 50 },
      { x: 50, y: 50 },
    ]);
    // Drag piece 1 next to piece 0 (its left neighbour). Solved delta between
    // them is one cell in x; place piece 1 there with a small error.
    const off0 = pieceOffset(s, 0);
    const off1 = pieceOffset(s, 1);
    const g0 = s.groups.get(groupOf(s, 0))!.origin;
    // Want group1.origin ~= group0.origin. Set piece1 world pos so that holds.
    placePieces(s, [
      { x: g0.x + off0.x, y: g0.y + off0.y },
      { x: g0.x + off1.x + 1, y: g0.y + off1.y }, // 1px error, within threshold
      { x: 0, y: 200 },
      { x: 200, y: 200 },
    ]);
    const res = applyDrop(s, groupOf(s, 1), snapThreshold(s));
    expect(res.merged).toBe(true);
    expect(groupOf(s, 0)).toBe(groupOf(s, 1));
    expect(groupCount(s)).toBe(3); // 0+1 joined, 2 and 3 still loose
    expect(isComplete(s)).toBe(false);
  });
});

describe("progress", () => {
  it("tracks fraction of joins made", () => {
    const s = freshSolved();
    expect(progress(s)).toBe(0);
    mergeGroups(s, groupOf(s, 0), groupOf(s, 1)); // 3 groups
    expect(progress(s)).toBeCloseTo(1 / 3);
    mergeGroups(s, groupOf(s, 2), groupOf(s, 3)); // 2 groups
    expect(progress(s)).toBeCloseTo(2 / 3);
    mergeGroups(s, groupOf(s, 0), groupOf(s, 2)); // 1 group
    expect(progress(s)).toBe(1);
    expect(isComplete(s)).toBe(true);
  });
});

describe("scatter", () => {
  it("is deterministic and lands every piece in the ring", () => {
    const spec: PuzzleSpec = { rows: 3, cols: 4, seed: 77, cellW: 10, cellH: 10 };
    const s = createGameState(spec);
    const a = scatterPositions(s);
    const b = scatterPositions(s);
    expect(a).toEqual(b); // deterministic

    const puzzleW = spec.cols * spec.cellW;
    const puzzleH = spec.rows * spec.cellH;
    const cx = puzzleW / 2;
    const cy = puzzleH / 2;
    for (const p of a) {
      // Outside the clear central ellipse (0.6 half-extents)...
      const ux = (p.x - cx) / (puzzleW * 0.6);
      const uy = (p.y - cy) / (puzzleH * 0.6);
      expect(ux * ux + uy * uy).toBeGreaterThan(0.999);
      // ...and inside the table ellipse (1.1 half-extents).
      const tx = (p.x - cx) / (puzzleW * 1.1);
      const ty = (p.y - cy) / (puzzleH * 1.1);
      expect(tx * tx + ty * ty).toBeLessThan(1.001);
    }
  });

  it("re-scatter with a salt differs from the initial layout", () => {
    const s = createGameState({ rows: 3, cols: 4, seed: 77, cellW: 10, cellH: 10 });
    expect(scatterPositions(s)).not.toEqual(scatterPositions(s, { salt: 1 }));
  });
});

describe("serialize round-trip", () => {
  it("is identity through serialize -> deserialize -> serialize", () => {
    const s = freshSolved();
    placePieces(s, [
      { x: 3, y: 4 },
      { x: 30, y: 4 },
      { x: 3, y: 40 },
      { x: 30, y: 40 },
    ]);
    mergeGroups(s, groupOf(s, 0), groupOf(s, 1));
    s.elapsedMs = 12345;
    s.movesCount = 9;

    const save1 = serialize(s);
    const restored = deserialize(save1, SPEC);
    const save2 = serialize(restored);
    expect(save2).toEqual(save1);

    // pieceToGroup index is rebuilt correctly.
    expect(groupOf(restored, 0)).toBe(groupOf(restored, 1));
    expect(groupCount(restored)).toBe(3);
  });
});
