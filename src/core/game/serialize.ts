import type { PuzzleSpec } from "../types";
import type { GameState, Group } from "./state";

/** Persisted group: origin stored as `x,y`, pieces as indices. */
export interface SaveGroupV1 {
  id: number;
  x: number;
  y: number;
  pieces: number[];
}

/**
 * The v1 save format (plan Q14). Stores GROUPS, not per-piece coords: a piece's
 * position is `group.origin + gridOffset(piece)`, so it cannot encode a state
 * where two pieces in a group disagree about where the group is.
 *
 * The DB stores `(rows, cols, seed)` on the puzzle row separately, so they are
 * not repeated here.
 */
export interface SaveV1 {
  v: 1;
  groups: SaveGroupV1[];
  elapsedMs: number;
  movesCount: number;
  completedAt: number | null;
}

/** Runtime state -> v1 save. Groups sorted by id for a stable, diffable blob. */
export function serialize(state: GameState): SaveV1 {
  const groups: SaveGroupV1[] = [];
  for (const g of state.groups.values()) {
    groups.push({ id: g.id, x: g.origin.x, y: g.origin.y, pieces: g.pieces.slice() });
  }
  groups.sort((a, b) => a.id - b.id);
  return {
    v: 1,
    groups,
    elapsedMs: state.elapsedMs,
    movesCount: state.movesCount,
    completedAt: state.completedAt,
  };
}

/**
 * v1 save + puzzle spec -> runtime state. `spec` supplies the geometry inputs
 * the save intentionally omits. Rebuilds the `pieceToGroup` index and
 * `nextGroupId` from the persisted groups.
 */
export function deserialize(save: SaveV1, spec: PuzzleSpec): GameState {
  if (save.v !== 1) throw new Error(`unsupported save version ${(save as { v: number }).v}`);

  const pieceCount = spec.rows * spec.cols;
  const groups = new Map<number, Group>();
  const pieceToGroup: number[] = new Array(pieceCount);
  let maxId = -1;

  for (const sg of save.groups) {
    groups.set(sg.id, {
      id: sg.id,
      origin: { x: sg.x, y: sg.y },
      rotation: 0,
      pieces: sg.pieces.slice(),
    });
    for (const p of sg.pieces) pieceToGroup[p] = sg.id;
    if (sg.id > maxId) maxId = sg.id;
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
    nextGroupId: maxId + 1,
    elapsedMs: save.elapsedMs,
    movesCount: save.movesCount,
    completedAt: save.completedAt,
  };
}
