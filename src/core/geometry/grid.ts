import type { GridDims } from "../types";

/**
 * Aspect ratios beyond this are clamped for grid derivation so panoramas still
 * produce sane grids (plan Q10). The image is letterboxed into the clamped box;
 * grid math never sees the raw extreme aspect.
 */
export const MAX_ASPECT = 2;

/**
 * Derive `{rows, cols}` from a target piece count and image aspect ratio
 * (width / height). Never fixed — pieces stay roughly square regardless of image
 * shape (plan Q6).
 *
 *   cols = round(sqrt(N * a)),  rows = round(N / cols)
 *
 * The realized count (`rows * cols`) drifts from the target; callers show the
 * real number ("~48 pieces").
 */
export function deriveGrid(targetCount: number, aspect: number): GridDims {
  if (!(targetCount >= 1)) throw new Error(`targetCount must be >= 1, got ${targetCount}`);
  if (!(aspect > 0)) throw new Error(`aspect must be > 0, got ${aspect}`);

  const a = clampAspect(aspect);
  const cols = Math.max(1, Math.round(Math.sqrt(targetCount * a)));
  const rows = Math.max(1, Math.round(targetCount / cols));
  return { rows, cols };
}

/** Clamp aspect into [1/MAX_ASPECT, MAX_ASPECT]. */
export function clampAspect(aspect: number): number {
  return Math.min(MAX_ASPECT, Math.max(1 / MAX_ASPECT, aspect));
}
