"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useGameStore } from "@/store/gameStore";
import { Lighting } from "./lighting";
import { CameraRig } from "./CameraRig";
import { PieceField } from "./PieceField";

/** Faint full-image hint under the assembly area (plan Q13 ghost toggle). */
function GhostPlane({ texture, w, h }: { texture: THREE.Texture; w: number; h: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // Quad in the solved footprint: world X in [0,w], Z in [0,h], flat at y≈0.
    const verts = new Float32Array([0, 0.02, 0, w, 0.02, 0, w, 0.02, h, 0, 0.02, h]);
    const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [w, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial map={texture} transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

/**
 * Owns the R3F scene. The image `texture` (and its lifecycle) is owned by the
 * caller — the canvas may unmount and remount across setup/play without
 * disposing it, so it must not dispose it here.
 */
export function PuzzleCanvas({
  texture,
  imgW,
  imgH,
  targetCount,
  seed,
}: {
  texture: THREE.Texture;
  imgW: number;
  imgH: number;
  targetCount: number;
  seed: number;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const init = useGameStore((s) => s.init);
  const spec = useGameStore((s) => s.spec);
  const edges = useGameStore((s) => s.edges);
  const epoch = useGameStore((s) => s.epoch);
  const ghost = useGameStore((s) => s.ghost);
  const lightTheme = useGameStore((s) => s.lightTheme);

  useEffect(() => {
    init(imgW, imgH, targetCount, seed);
  }, [init, imgW, imgH, targetCount, seed]);

  if (!spec || !edges) {
    return <div className="grid h-full w-full place-items-center text-sm opacity-60">Loading…</div>;
  }

  const puzzleW = spec.cols * spec.cellW;
  const puzzleH = spec.rows * spec.cellH;
  const cx = puzzleW / 2;
  const cz = puzzleH / 2;
  const span = Math.max(puzzleW, puzzleH) * 2.2;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ fov: 45, near: 0.1, far: span * 6, position: [cx, span * 0.5, cz + span * 0.5] }}
    >
      <color attach="background" args={[lightTheme ? "#eef1f5" : "#1b1d21"]} />
      <Lighting span={span} />
      <CameraRig target={[cx, 0, cz]} span={span} ref={controlsRef} />

      {/* Table surface — receives shadows and is the pan/raycast plane. */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[span * 3, span * 3]} />
        <meshStandardMaterial color={lightTheme ? "#d6d9df" : "#2a2d33"} roughness={1} metalness={0} />
      </mesh>

      {ghost && <GhostPlane texture={texture} w={puzzleW} h={puzzleH} />}

      <PieceField key={epoch} edges={edges} spec={spec} texture={texture} controlsRef={controlsRef} />
    </Canvas>
  );
}
