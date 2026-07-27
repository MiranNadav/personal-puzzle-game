/** Shared value types for `core/`. Framework-free. */

export interface Vec2 {
  x: number;
  y: number;
}

/** Dimensions derived from a target piece count and image aspect. */
export interface GridDims {
  rows: number;
  cols: number;
}

/**
 * Everything geometry needs, derived purely from `(seed, rows, cols)` plus the
 * image's pixel size. The DB stores only `rows`, `cols`, `seed` (plus imageId);
 * this struct is rebuilt identically on any client.
 */
export interface PuzzleSpec {
  rows: number;
  cols: number;
  seed: number;
  /** Width of one cell in core world units. */
  cellW: number;
  /** Height of one cell in core world units. */
  cellH: number;
}
