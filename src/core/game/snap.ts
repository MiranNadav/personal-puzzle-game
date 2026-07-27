import type { Vec2 } from "../types";
import type { GameState } from "./state";
import { pieceRow, pieceCol, pieceIndex } from "./state";
import { mergeGroups } from "./groups";

/**
 * Snap tolerance as a fraction of the smaller cell dimension (plan Q7).
 *
 * Must stay below 0.5: neighbour-correct origins are exactly one cell apart, so
 * at 0.5 a piece equidistant from two candidate alignments could snap to the
 * wrong one. 0.35 is as forgiving as the grid safely allows — the plan's 0.2 was
 * a guess that in practice demanded near-pixel accuracy, and the live snap
 * preview (render layer) now shows the player when they're inside the window.
 */
export const SNAP_FRACTION = 0.35;

export function snapThreshold(state: GameState): number {
  return Math.min(state.cellW, state.cellH) * SNAP_FRACTION;
}

/** The 4 grid-neighbour piece indices that exist (bounds-checked). */
export function neighborPieces(state: GameState, index: number): number[] {
  const r = pieceRow(state, index);
  const c = pieceCol(state, index);
  const out: number[] = [];
  if (r > 0) out.push(pieceIndex(state.cols, r - 1, c));
  if (r < state.rows - 1) out.push(pieceIndex(state.cols, r + 1, c));
  if (c > 0) out.push(pieceIndex(state.cols, r, c - 1));
  if (c < state.cols - 1) out.push(pieceIndex(state.cols, r, c + 1));
  return out;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export interface DropResult {
  merged: boolean;
  /** Surviving group id after any merges (the dragged group). */
  groupId: number;
}

/** Where a group would land if released right now, and what it would join. */
export interface SnapCandidate {
  /** The stationary neighbour group that would be joined. */
  targetGroupId: number;
  /** Origin the dragged group snaps to (the target group's origin). */
  origin: Vec2;
  /** Current misalignment, in world units. 0 = perfectly aligned. */
  distance: number;
}

/**
 * The join a group would make if released at its current origin, or null if
 * nothing is in range. Two grid-neighbour pieces belong together exactly when
 * their groups share the same solved `origin`, so misalignment is
 * `|dragged.origin - neighbour.origin|` and the nearest neighbour within
 * `threshold` wins.
 *
 * Pure and side-effect free: the drag loop calls this every frame to preview the
 * landing spot, and `applyDrop` calls it to resolve the actual drop. Both must
 * agree, which is why they share one implementation rather than two that drift.
 */
export function findSnapCandidate(
  state: GameState,
  draggedGroupId: number,
  threshold: number,
): SnapCandidate | null {
  const g = state.groups.get(draggedGroupId);
  if (!g) return null;

  let bestId = -1;
  let bestD = Infinity;
  for (const p of g.pieces) {
    for (const q of neighborPieces(state, p)) {
      const qg = state.pieceToGroup[q];
      if (qg === draggedGroupId) continue;
      const other = state.groups.get(qg)!;
      const d = dist(g.origin.x, g.origin.y, other.origin.x, other.origin.y);
      if (d <= threshold && d < bestD) {
        bestD = d;
        bestId = qg;
      }
    }
  }
  if (bestId < 0) return null;

  const target = state.groups.get(bestId)!;
  return {
    targetGroupId: bestId,
    origin: { x: target.origin.x, y: target.origin.y },
    distance: bestD,
  };
}

/**
 * Resolve a drop of `draggedGroupId`. If a neighbour group is within the snap
 * threshold, snap the dragged group onto the nearest one, then absorb every
 * neighbour group that lands within threshold (cascading through the cluster).
 *
 * The dragged group survives (keeps its id); absorbed pieces reposition to the
 * snapped origin automatically because position = origin + fixed offset.
 */
export function applyDrop(state: GameState, draggedGroupId: number, threshold: number): DropResult {
  const g = state.groups.get(draggedGroupId);
  if (!g) throw new Error(`applyDrop: missing group ${draggedGroupId}`);

  const candidate = findSnapCandidate(state, draggedGroupId, threshold);
  if (!candidate) return { merged: false, groupId: draggedGroupId };

  // Snap onto the stationary neighbour, then cascade-merge the whole cluster.
  g.origin = { x: candidate.origin.x, y: candidate.origin.y };

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of g.pieces) {
      let restart = false;
      for (const q of neighborPieces(state, p)) {
        const qg = state.pieceToGroup[q];
        if (qg === draggedGroupId) continue;
        const other = state.groups.get(qg)!;
        if (dist(g.origin.x, g.origin.y, other.origin.x, other.origin.y) <= threshold) {
          mergeGroups(state, draggedGroupId, qg);
          changed = true;
          restart = true;
          break;
        }
      }
      if (restart) break;
    }
  }

  return { merged: true, groupId: draggedGroupId };
}
