"use client";

import * as THREE from "three";
import { cellCenter, piecePath, type EdgeGrid } from "@/core";

export interface PieceGeoParams {
  edges: EdgeGrid;
  row: number;
  col: number;
  cellW: number;
  cellH: number;
  puzzleW: number;
  puzzleH: number;
}

/**
 * Translate the framework-free path commands from `core/geometry/shape.ts` into
 * an `ExtrudeGeometry` — the one place `THREE.Shape` is allowed to touch core
 * output (plan Q15). Also assigns GLOBAL image UVs (each piece samples its slice
 * of the whole picture, tabs included) and lays the piece flat on the y=0 table.
 */
export function buildPieceGeometry(p: PieceGeoParams): THREE.BufferGeometry {
  const { edges, row, col, cellW, cellH, puzzleW, puzzleH } = p;
  const cmds = piecePath(edges, row, col, cellW, cellH);
  const cc = cellCenter(row, col, cellW, cellH); // absolute cell center (y-down)

  // Map absolute (ax, ay) -> centered shape coords (y-up): sx = ax-cc.x, sy = -(ay-cc.y).
  const shape = new THREE.Shape();
  for (const cmd of cmds) {
    if (cmd.type === "moveTo") shape.moveTo(cmd.x - cc.x, -(cmd.y - cc.y));
    else if (cmd.type === "lineTo") shape.lineTo(cmd.x - cc.x, -(cmd.y - cc.y));
    else
      shape.bezierCurveTo(
        cmd.c1x - cc.x,
        -(cmd.c1y - cc.y),
        cmd.c2x - cc.x,
        -(cmd.c2y - cc.y),
        cmd.x - cc.x,
        -(cmd.y - cc.y),
      );
  }

  const unit = Math.min(cellW, cellH);
  const thickness = unit * 0.16;
  const bevel = unit * 0.04;

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
  });

  // Global UVs from absolute coords so the whole image maps across all pieces,
  // and tab overhangs sample the neighbour's image region (real jigsaw look).
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = pos.getX(i) + cc.x;
    const ay = cc.y - pos.getY(i);
    uv[i * 2] = ax / puzzleW;
    uv[i * 2 + 1] = 1 - ay / puzzleH;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

  // Lay flat: extrude depth (+Z) becomes world up (+Y); piece rests on y=0.
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}
