"use client";

import { create } from "zustand";
import type { EdgeGrid, GameState, PuzzleSpec } from "@/core";
import {
  createGameState,
  deriveGrid,
  generateEdges,
  isComplete,
  placePieces,
  progress as coreProgress,
  scatterPositions,
  snapThreshold,
  applyDrop,
} from "@/core";

/**
 * Holds the authoritative `core` GameState plus render-facing derived values.
 *
 * Critical invariant (plan Q15): the drag loop mutates `state` in place and
 * reads it via `useGameStore.getState()` inside `useFrame` — it never subscribes.
 * Only low-frequency events (drop, toggles) call `set()`, so React re-renders a
 * handful of times per session, not 60×/sec.
 */
export interface GameStore {
  state: GameState | null;
  edges: EdgeGrid | null;
  spec: PuzzleSpec | null;

  // Derived, updated only on drop / reset — safe for HUD subscription.
  progress: number;
  moves: number;
  completed: boolean;
  completedAt: number | null;

  // Findability toggles (plan Q13).
  edgesOnly: boolean;
  ghost: boolean;

  // Bumped on structural change (merge/reset) so meshes re-mount cleanly.
  epoch: number;

  init(imgW: number, imgH: number, targetCount: number, seed: number): void;
  commitDrop(groupId: number): void;
  spreadOut(): void;
  toggleEdgesOnly(): void;
  toggleGhost(): void;
  reset(seed: number): void;
}

/** World cell height; width derives from image cell aspect so pieces aren't distorted. */
const CELL_H = 1;

function buildSpec(imgW: number, imgH: number, targetCount: number, seed: number): PuzzleSpec {
  const aspect = imgW / imgH;
  const { rows, cols } = deriveGrid(targetCount, aspect);
  const pxCellW = imgW / cols;
  const pxCellH = imgH / rows;
  const cellW = (pxCellW / pxCellH) * CELL_H;
  return { rows, cols, seed, cellW, cellH: CELL_H };
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  edges: null,
  spec: null,
  progress: 0,
  moves: 0,
  completed: false,
  completedAt: null,
  edgesOnly: false,
  ghost: false,
  epoch: 0,

  init(imgW, imgH, targetCount, seed) {
    const spec = buildSpec(imgW, imgH, targetCount, seed);
    const state = createGameState(spec);
    placePieces(state, scatterPositions(state));
    const edges = generateEdges(spec.seed, spec.rows, spec.cols);
    set((s) => ({
      spec,
      state,
      edges,
      progress: 0,
      moves: 0,
      completed: false,
      completedAt: null,
      epoch: s.epoch + 1,
    }));
  },

  commitDrop(groupId) {
    const st = get().state;
    if (!st) return;
    applyDrop(st, groupId, snapThreshold(st));
    st.movesCount += 1;
    const done = isComplete(st);
    if (done && st.completedAt == null) st.completedAt = Date.now();
    // Positions recompute from state every frame, so a merge needs no re-mount;
    // only push derived values the HUD subscribes to.
    set({
      progress: coreProgress(st),
      moves: st.movesCount,
      completed: done,
      completedAt: st.completedAt,
    });
  },

  spreadOut() {
    const st = get().state;
    if (!st) return;
    // Re-scatter only loose (size-1) groups; leave assembled clusters where the
    // player built them. Salt varies the layout from the initial scatter.
    const positions = scatterPositions(st, { salt: st.movesCount + 1 });
    for (let i = 0; i < st.pieceCount; i++) {
      const g = st.groups.get(st.pieceToGroup[i])!;
      if (g.pieces.length !== 1) continue;
      const offX = ((i % st.cols) + 0.5) * st.cellW;
      const offY = (Math.floor(i / st.cols) + 0.5) * st.cellH;
      g.origin = { x: positions[i].x - offX, y: positions[i].y - offY };
    }
    // Origins mutate in place; the frame loop reflects them. No re-mount needed.
  },

  toggleEdgesOnly() {
    set((s) => ({ edgesOnly: !s.edgesOnly }));
  },
  toggleGhost() {
    set((s) => ({ ghost: !s.ghost }));
  },

  reset(seed) {
    const { spec } = get();
    if (!spec) return;
    const next: PuzzleSpec = { ...spec, seed };
    const state = createGameState(next);
    placePieces(state, scatterPositions(state));
    const edges = generateEdges(next.seed, next.rows, next.cols);
    set((s) => ({
      spec: next,
      state,
      edges,
      progress: 0,
      moves: 0,
      completed: false,
      completedAt: null,
      epoch: s.epoch + 1,
    }));
  },
}));
