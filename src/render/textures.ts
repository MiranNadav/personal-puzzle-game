"use client";

import * as THREE from "three";

/**
 * M0 uses a hardcoded, procedurally-drawn "photo" instead of an upload: a
 * colourful gradient with big shapes and a faint coordinate grid. The grid +
 * hue gradient make it obvious when two pieces truly line up, which is exactly
 * what the M0 gate ("does the click-together feel right") needs to judge.
 *
 * Real uploads arrive in M1; this keeps the spike backend-free.
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
