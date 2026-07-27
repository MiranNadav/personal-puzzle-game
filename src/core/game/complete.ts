import type { GameState } from "./state";

/** Number of distinct groups (clusters) currently on the table. */
export function groupCount(state: GameState): number {
  return state.groups.size;
}

/**
 * Completion: the union-find has collapsed to a single set covering every piece
 * (plan Q7). Cheap — just one group left.
 */
export function isComplete(state: GameState): boolean {
  return state.groups.size === 1;
}

/**
 * Fraction of joins made: `(pieceCount - groupCount) / (pieceCount - 1)`.
 * 0 at start (every piece its own group), 1 when fully assembled. Reflects real
 * progress — joining two large clusters counts for more than placing one piece
 * (plan Q18). Single-piece puzzles are trivially complete (1).
 */
export function progress(state: GameState): number {
  if (state.pieceCount <= 1) return 1;
  return (state.pieceCount - state.groups.size) / (state.pieceCount - 1);
}
