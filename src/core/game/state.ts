import type { PuzzleSpec, Vec2 } from "../types";
import { cellCenter } from "../geometry/shape";

/**
 * A rigid cluster of joined pieces that drags as one unit. Loose pieces are
 * groups of size 1. Union-find membership and position live in the SAME object
 * so they cannot desync (plan Q14).
 *
 * A piece's world position is `origin + pieceOffset(piece)` — the group stores
 * position once, never per-piece coords.
 */
export interface Group {
  id: number;
  /** World translation applied to every piece's solved cell-center. */
  origin: Vec2;
  /** Always 0 in v1. Reserved so rotation later touches snap/input, not schema. */
  rotation: number;
  /** Piece indices in this group. */
  pieces: number[];
}

/** Full runtime game state. Serialized to the v1 save format by `serialize.ts`. */
export interface GameState {
  rows: number;
  cols: number;
  seed: number;
  cellW: number;
  cellH: number;
  pieceCount: number;
  groups: Map<number, Group>;
  /** pieceIndex -> groupId. The fast `find`. */
  pieceToGroup: number[];
  nextGroupId: number;
  elapsedMs: number;
  movesCount: number;
  completedAt: number | null;
}

export function pieceRow(state: { cols: number }, index: number): number {
  return Math.floor(index / state.cols);
}

export function pieceCol(state: { cols: number }, index: number): number {
  return index % state.cols;
}

export function pieceIndex(cols: number, row: number, col: number): number {
  return row * cols + col;
}

/**
 * The fixed grid offset of a piece from its group origin: the solved cell
 * center in absolute (y-down) puzzle space. Position within a group is a pure
 * function of the piece index — never stored.
 */
export function pieceOffset(state: GameState, index: number): Vec2 {
  return cellCenter(pieceRow(state, index), pieceCol(state, index), state.cellW, state.cellH);
}

/** World position of a piece = its group origin + fixed grid offset. */
export function piecePosition(state: GameState, index: number): Vec2 {
  const g = state.groups.get(state.pieceToGroup[index])!;
  const off = pieceOffset(state, index);
  return { x: g.origin.x + off.x, y: g.origin.y + off.y };
}

/**
 * Solved state: every piece is its own group at origin (0,0), so each sits at
 * its true cell center (the assembled image), but nothing is joined yet. Callers
 * scatter afterwards (`scatter.ts`).
 */
export function createGameState(spec: PuzzleSpec): GameState {
  const pieceCount = spec.rows * spec.cols;
  const groups = new Map<number, Group>();
  const pieceToGroup: number[] = new Array(pieceCount);
  for (let i = 0; i < pieceCount; i++) {
    groups.set(i, { id: i, origin: { x: 0, y: 0 }, rotation: 0, pieces: [i] });
    pieceToGroup[i] = i;
  }
  return {
    rows: spec.rows,
    cols: spec.cols,
    seed: spec.seed,
    cellW: spec.cellW,
    cellH: spec.cellH,
    pieceCount,
    groups,
    pieceToGroup,
    nextGroupId: pieceCount,
    elapsedMs: 0,
    movesCount: 0,
    completedAt: null,
  };
}

/** Place each loose group so its piece sits at `positions[pieceIndex]`. */
export function placePieces(state: GameState, positions: Vec2[]): void {
  for (let i = 0; i < state.pieceCount; i++) {
    const g = state.groups.get(state.pieceToGroup[i])!;
    const off = pieceOffset(state, i);
    g.origin = { x: positions[i].x - off.x, y: positions[i].y - off.y };
  }
}
