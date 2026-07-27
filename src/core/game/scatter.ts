import type { GameState } from "./state";
import type { Vec2 } from "../types";
import { makeRng } from "../rng";

export interface ScatterOptions {
  /** Extra seed offset so "spread out" re-scatters differ from the initial one. */
  salt?: number;
  /** Min centre-to-centre spacing, as a fraction of the larger cell size. */
  minDistFraction?: number;
  maxAttempts?: number;
}

/**
 * Initial (and re-scatter) layout: loose pieces spread face-up in a margin ring
 * around a clear central assembly zone, jitter-only, minimal overlap
 * (Poisson-disc-style dart throwing). Deterministic from `seed` so reloads
 * restore the same table (plan Q13).
 *
 * Returns one world position (cell-center, y-down absolute space) per piece
 * index — feed to `placePieces`.
 */
export function scatterPositions(state: GameState, options: ScatterOptions = {}): Vec2[] {
  const { salt = 0, minDistFraction = 0.8, maxAttempts = 40 } = options;
  const rng = makeRng((state.seed ^ (0x9e3779b9 + salt)) >>> 0);

  const puzzleW = state.cols * state.cellW;
  const puzzleH = state.rows * state.cellH;
  const cx = puzzleW / 2;
  const cy = puzzleH / 2;

  // Clear central zone (the assembly area) and the outer table bound. Pieces
  // land in the elliptical ring between them.
  const clearHalfW = puzzleW * 0.6;
  const clearHalfH = puzzleH * 0.6;
  const tableHalfW = puzzleW * 1.1;
  const tableHalfH = puzzleH * 1.1;

  const minDist = Math.max(state.cellW, state.cellH) * minDistFraction;
  const minDist2 = minDist * minDist;

  const placed: Vec2[] = [];
  const positions: Vec2[] = new Array(state.pieceCount);

  for (let i = 0; i < state.pieceCount; i++) {
    let chosen: Vec2 | null = null;
    let fallback: Vec2 | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = rng.uniform(0, Math.PI * 2);
      const u = Math.sqrt(rng.next()); // bias outward for even area coverage
      const rx = clearHalfW + (tableHalfW - clearHalfW) * u;
      const ry = clearHalfH + (tableHalfH - clearHalfH) * u;
      const cand: Vec2 = { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
      fallback = cand;

      let ok = true;
      for (const q of placed) {
        const dx = cand.x - q.x;
        const dy = cand.y - q.y;
        if (dx * dx + dy * dy < minDist2) {
          ok = false;
          break;
        }
      }
      if (ok) {
        chosen = cand;
        break;
      }
    }

    // If the ring is too crowded to honour spacing, accept the last candidate —
    // it's still in the ring, just closer than ideal. The "spread out" button
    // exists precisely because pieces do stack.
    const pos = chosen ?? fallback!;
    placed.push(pos);
    positions[i] = pos;
  }

  return positions;
}
