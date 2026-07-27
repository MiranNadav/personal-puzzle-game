import type { GameState } from "./state";

/** The group id a piece currently belongs to (the union-find `find`). */
export function groupOf(state: GameState, pieceIndex: number): number {
  return state.pieceToGroup[pieceIndex];
}

/**
 * Merge group `dropId` into `keepId`: reparent all of drop's pieces, delete the
 * drop group. Callers must have already reconciled origins (snap sets the
 * dragged group's origin to the stationary neighbour before merging), so the
 * kept origin is authoritative. No-op if the ids are equal.
 */
export function mergeGroups(state: GameState, keepId: number, dropId: number): void {
  if (keepId === dropId) return;
  const keep = state.groups.get(keepId);
  const drop = state.groups.get(dropId);
  if (!keep || !drop) throw new Error(`mergeGroups: missing group ${keepId} or ${dropId}`);
  for (const p of drop.pieces) {
    keep.pieces.push(p);
    state.pieceToGroup[p] = keepId;
  }
  keep.pieces.sort((a, b) => a - b);
  state.groups.delete(dropId);
}
