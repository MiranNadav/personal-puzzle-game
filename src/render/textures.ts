"use client";

import * as THREE from "three";

/** A decoded, GPU-ready image plus its pixel dimensions (post-downscale). */
export interface LoadedTexture {
  texture: THREE.CanvasTexture;
  width: number;
  height: number;
}

/**
 * Longest edge a puzzle texture is downscaled to. Caps GPU texture memory so
 * 300-piece scenes stay inside the M0 perf envelope, and bounds the cost of the
 * client-side decode. (M2 will re-encode server-side with sharp; M1 is
 * client-only, so this is the only guard.)
 */
const MAX_DIM = 2048;

/** Cap the load path so a monster upload can't hang the decode. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Decode an uploaded image to a texture, applying EXIF orientation and
 * downscaling to `MAX_DIM`. Entirely client-side (plan M1: upload via the
 * browser, no server).
 *
 * `createImageBitmap(..., { imageOrientation: "from-image" })` bakes the EXIF
 * orientation into the pixels, so a phone photo shot in portrait isn't sideways
 * and the stored EXIF (incl. GPS) never reaches the canvas. Throws if the bytes
 * aren't a decodable image (e.g. HEIC in browsers that can't decode it) — the
 * caller turns that into a user-facing message.
 */
export async function loadImageFile(file: File): Promise<LoadedTexture> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, w, h);

    return { texture: canvasToTexture(canvas), width: w, height: h };
  } finally {
    bitmap.close();
  }
}

/** Wrap the procedural demo image as a `LoadedTexture` for the "try a sample" path. */
export function makeSampleImage(): LoadedTexture {
  const texture = makeDemoTexture(2048, 1.5);
  const canvas = texture.image as HTMLCanvasElement;
  return { texture, width: canvas.width, height: canvas.height };
}

function canvasToTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * A hardcoded, procedurally-drawn "photo": a colourful gradient with big shapes
 * and a faint coordinate grid. The grid + hue gradient make it obvious when two
 * pieces truly line up. Served as the "try a sample" option so the game is
 * playable without an upload.
 */
export function makeDemoTexture(size = 2048, aspect = 1.5): THREE.CanvasTexture {
  const w = Math.round(size);
  const h = Math.round(size / aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Diagonal multi-stop gradient background.
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0.0, "#ff5f6d");
  g.addColorStop(0.25, "#ffc371");
  g.addColorStop(0.5, "#47cf73");
  g.addColorStop(0.75, "#2193b0");
  g.addColorStop(1.0, "#6a3093");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Big translucent circles for regional colour variety.
  const blobs: [number, number, number, string][] = [
    [0.2, 0.3, 0.22, "rgba(255,255,255,0.35)"],
    [0.75, 0.25, 0.18, "rgba(0,0,0,0.25)"],
    [0.55, 0.7, 0.25, "rgba(255,255,0,0.3)"],
    [0.85, 0.8, 0.15, "rgba(0,80,255,0.35)"],
    [0.1, 0.8, 0.14, "rgba(255,0,150,0.35)"],
  ];
  for (const [cx, cy, r, color] of blobs) {
    ctx.beginPath();
    ctx.arc(cx * w, cy * h, r * Math.min(w, h), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Faint fine grid so alignment reads clearly.
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  const step = Math.min(w, h) / 16;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
