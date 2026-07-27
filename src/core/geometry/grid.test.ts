import { describe, it, expect } from "vitest";
import { deriveGrid, clampAspect, MAX_ASPECT } from "./grid";

describe("deriveGrid", () => {
  it("keeps cells roughly square: cols/rows tracks aspect", () => {
    const wide = deriveGrid(100, 2);
    expect(wide.cols).toBeGreaterThan(wide.rows);
    const tall = deriveGrid(100, 0.5);
    expect(tall.rows).toBeGreaterThan(tall.cols);
    const square = deriveGrid(100, 1);
    expect(square.rows).toBe(square.cols);
  });

  it("realized count lands near the target", () => {
    for (const n of [24, 100, 300]) {
      for (const a of [0.6, 1, 1.5, 2]) {
        const { rows, cols } = deriveGrid(n, a);
        const realized = rows * cols;
        expect(realized).toBeGreaterThan(n * 0.7);
        expect(realized).toBeLessThan(n * 1.3);
      }
    }
  });

  it("clamps extreme aspects into the panorama-safe range", () => {
    expect(clampAspect(10)).toBe(MAX_ASPECT);
    expect(clampAspect(0.01)).toBe(1 / MAX_ASPECT);
    expect(clampAspect(1.3)).toBe(1.3);
  });

  it("rejects nonsense inputs", () => {
    expect(() => deriveGrid(0, 1)).toThrow();
    expect(() => deriveGrid(10, 0)).toThrow();
    expect(() => deriveGrid(10, -1)).toThrow();
  });
});
