/** Public surface of the framework-free game core. */
export * from "./types";
export { makeRng } from "./rng";
export type { Rng } from "./rng";

export { deriveGrid, clampAspect, MAX_ASPECT } from "./geometry/grid";
export { generateEdges } from "./geometry/edges";
export type { EdgeGrid, EdgeParams } from "./geometry/edges";
export { piecePath, cellCenter } from "./geometry/shape";
export type { PathCommand } from "./geometry/shape";

export {
  createGameState,
  placePieces,
  piecePosition,
  pieceOffset,
  pieceRow,
  pieceCol,
  pieceIndex,
} from "./game/state";
export type { GameState, Group } from "./game/state";
export { groupOf, mergeGroups } from "./game/groups";
export {
  applyDrop,
  findSnapCandidate,
  neighborPieces,
  snapThreshold,
  SNAP_FRACTION,
} from "./game/snap";
export type { DropResult, SnapCandidate } from "./game/snap";
export { scatterPositions } from "./game/scatter";
export type { ScatterOptions } from "./game/scatter";
export { isComplete, progress, groupCount } from "./game/complete";
export { serialize, deserialize } from "./game/serialize";
export type { SaveV1, SaveGroupV1 } from "./game/serialize";
