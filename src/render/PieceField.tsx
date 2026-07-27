"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { piecePosition, type EdgeGrid, type PuzzleSpec } from "@/core";
import { useGameStore } from "@/store/gameStore";
import { buildPieceGeometry } from "./usePieceGeometry";

interface DragState {
  groupId: number;
  grabX: number;
  grabY: number;
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * All piece meshes plus the drag controller and the per-frame positioning loop.
 *
 * The positioning loop reads the store via `getState()` inside `useFrame` and
 * mutates `mesh.position` imperatively — never a React subscription (plan Q15).
 * Dragging mutates `group.origin` in place; the next frame reflects it. React
 * re-renders only on drop (via the store's derived values), not per pointermove.
 */
export function PieceField({
  edges,
  spec,
  texture,
  controlsRef,
}: {
  edges: EdgeGrid;
  spec: PuzzleSpec;
  texture: THREE.Texture;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { gl, camera, raycaster } = useThree();
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const liftY = useRef<Float32Array>(new Float32Array(spec.rows * spec.cols));
  const drag = useRef<DragState | null>(null);

  const puzzleW = spec.cols * spec.cellW;
  const puzzleH = spec.rows * spec.cellH;
  const unit = Math.min(spec.cellW, spec.cellH);

  // ExtrudeGeometry emits two material groups: index 0 = the top/bottom caps
  // (image faces), index 1 = the extruded side walls + bevel. Giving the sides a
  // fixed light material paints a bright physical rim on every piece, so a dark
  // image tile stays visible against the dark table (it no longer relies on the
  // image having any edge contrast of its own).
  const material = useMemo(() => {
    const top = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.82,
      metalness: 0.02,
    });
    const side = new THREE.MeshStandardMaterial({
      color: "#e8e8ea",
      emissive: "#3a3a3d", // small self-lit floor so the rim reads even in shadow
      roughness: 0.6,
      metalness: 0.0,
    });
    return [top, side];
  }, [texture]);

  // Static geometry per piece — a pure function of (seed, rows, cols), rebuilt
  // only when a new puzzle loads.
  const geometries = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        geos.push(
          buildPieceGeometry({
            edges,
            row: r,
            col: c,
            cellW: spec.cellW,
            cellH: spec.cellH,
            puzzleW,
            puzzleH,
          }),
        );
      }
    }
    return geos;
  }, [edges, spec, puzzleW, puzzleH]);

  useEffect(() => {
    return () => {
      geometries.forEach((g) => g.dispose());
      material.forEach((m) => m.dispose());
    };
  }, [geometries, material]);

  const isInterior = (i: number) => {
    const r = Math.floor(i / spec.cols);
    const c = i % spec.cols;
    return r > 0 && r < spec.rows - 1 && c > 0 && c < spec.cols - 1;
  };

  // --- Drag controller -----------------------------------------------------
  const onPiecePointerDown = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    const store = useGameStore.getState();
    const st = store.state;
    if (!st || store.completed) return;
    if (store.edgesOnly && isInterior(i)) return; // hidden pieces aren't grabbable
    e.stopPropagation();

    const pt = new THREE.Vector3();
    if (!e.ray.intersectPlane(GROUND, pt)) return;

    const groupId = st.pieceToGroup[i];
    const g = st.groups.get(groupId)!;
    drag.current = { groupId, grabX: g.origin.x - pt.x, grabY: g.origin.y - pt.z };
    if (controlsRef.current) controlsRef.current.enabled = false;
    gl.domElement.setPointerCapture?.(e.pointerId);
    gl.domElement.style.cursor = "grabbing";
  };

  useEffect(() => {
    const el = gl.domElement;

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const st = useGameStore.getState().state;
      if (!st) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const pt = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(GROUND, pt)) return;
      const g = st.groups.get(d.groupId);
      if (!g) return;
      g.origin.x = pt.x + d.grabX;
      g.origin.y = pt.z + d.grabY;
    };

    const onUp = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      useGameStore.getState().commitDrop(d.groupId);
      if (controlsRef.current) controlsRef.current.enabled = true;
      el.style.cursor = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gl, camera, raycaster, controlsRef]);

  // --- Positioning loop ----------------------------------------------------
  useFrame((_, dt) => {
    const store = useGameStore.getState();
    const st = store.state;
    if (!st) return;
    const draggingGroup = drag.current?.groupId ?? -1;
    const lift = unit * 0.5;
    const edgesOnly = store.edgesOnly;

    for (let i = 0; i < st.pieceCount; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;

      if (edgesOnly && isInterior(i)) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      const pos = piecePosition(st, i);
      const grabbed = st.pieceToGroup[i] === draggingGroup;
      const target = grabbed ? lift : 0;
      // Ease the lift for a "picked up / settles on drop" feel.
      const k = Math.min(1, dt * 12);
      liftY.current[i] += (target - liftY.current[i]) * k;

      mesh.position.set(pos.x, liftY.current[i], pos.y);
    }
  });

  return (
    <group>
      {geometries.map((geo, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshRefs.current[i] = m;
          }}
          geometry={geo}
          material={material}
          castShadow
          receiveShadow
          onPointerDown={onPiecePointerDown(i)}
        />
      ))}
    </group>
  );
}
