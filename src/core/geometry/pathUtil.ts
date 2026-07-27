import type { Vec2 } from "../types";
import type { PathCommand } from "./shape";

/** Evaluate a cubic bezier at parameter t in [0,1]. */
export function cubicAt(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p3.y,
  };
}

/**
 * Flatten a path (moveTo/lineTo/bezierTo) into a dense polyline of world points.
 * `perBezier` controls bezier subdivision. Shared by rendering-free tests and
 * any 2D fallback that needs sampled outlines.
 */
export function flattenPath(cmds: PathCommand[], perBezier = 24): Vec2[] {
  const pts: Vec2[] = [];
  let cur: Vec2 = { x: 0, y: 0 };
  for (const cmd of cmds) {
    if (cmd.type === "moveTo") {
      cur = { x: cmd.x, y: cmd.y };
      pts.push(cur);
    } else if (cmd.type === "lineTo") {
      cur = { x: cmd.x, y: cmd.y };
      pts.push(cur);
    } else {
      const p0 = cur;
      const c1 = { x: cmd.c1x, y: cmd.c1y };
      const c2 = { x: cmd.c2x, y: cmd.c2y };
      const p3 = { x: cmd.x, y: cmd.y };
      for (let i = 1; i <= perBezier; i++) {
        pts.push(cubicAt(p0, c1, c2, p3, i / perBezier));
      }
      cur = p3;
    }
  }
  return pts;
}

/**
 * Signed area of a closed polygon (shoelace). Magnitude = enclosed area; used to
 * check piece bodies tile the source rect without gaps or overlaps.
 */
export function polygonArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
