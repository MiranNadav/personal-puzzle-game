"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  findSnapCandidate,
  piecePosition,
  snapThreshold,
  type EdgeGrid,
  type PuzzleSpec,
} from "@/core";
import { useGameStore } from "@/store/gameStore";
import { buildPieceGeometry } from "./usePieceGeometry";

interface DragState {
  groupId: number;
  /** `origin - pointer` captured at grab time, so the piece never jumps. */
  grabX: number;
  grabY: number;
  /** Latest pointer position on the z=0 plane (world x, z). */
  ptX: number;
  ptY: number;
  /** Finger drag: the piece rides clear of the contact point so it stays visible. */
  touch: boolean;
  /** World-space offset that lifts the piece above the fingertip. */
  offX: number;
  offY: number;
  /** 0→1 ramp so the finger offset slides in instead of popping. */
  ease: number;
  /** 0→1 magnetic pull toward the previewed snap alignment. */
  pull: number;
  /** Last previewed join; kept while `pull` eases back out. */
  hasSnap: boolean;
  snapX: number;
  snapY: number;
  /** The stationary group that would be joined, lit up alongside the dragged one. */
  snapGroupId: number;
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** How far above the contact point a finger-dragged piece rides, in CSS px. */
const TOUCH_LIFT_PX = 56;

/** Matches the HUD's emerald accent, so "this will join" reads the same everywhere. */
const SNAP_COLOR = "#34d399";

/**
 * All piece meshes plus the drag controller, the drag-feedback cues, and the
 * per-frame positioning loop.
 *
 * The positioning loop reads the store via `getState()` inside `useFrame` and
 * mutates `mesh.position` imperatively — never a React subscription (plan Q15).
 * It also owns `group.origin` while a drag is live: `onMove` only records the
 * pointer's plane position, and the frame loop turns that into an origin. That
 * split is what lets the finger offset and the snap pull ease over time instead
 * of stepping per pointer event. React re-renders only on drop.
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

  // Touch cues, driven imperatively from the frame loop.
  const fingerRef = useRef<THREE.Mesh | null>(null);
  const tetherRef = useRef<THREE.LineSegments | null>(null);

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

  /**
   * Swapped onto the dragged group while a join is in range. The rim lights up
   * emerald and the face gets a faint lift — the one "it will fit" signal that
   * nothing can occlude, since it's the piece itself rather than a marker under
   * or over it.
   */
  const highlight = useMemo(() => {
    const top = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.82,
      metalness: 0.02,
      emissive: new THREE.Color(SNAP_COLOR),
      emissiveIntensity: 0.14,
    });
    const side = new THREE.MeshStandardMaterial({
      color: SNAP_COLOR,
      emissive: new THREE.Color(SNAP_COLOR),
      emissiveIntensity: 0.75,
      roughness: 0.5,
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

  // Touch-cue geometry/materials: built once, transformed per frame. Opacity is
  // animated directly on these material instances, so they're held here rather
  // than declared inline.
  const overlay = useMemo(() => {
    const ringGeo = new THREE.RingGeometry(unit * 0.16, unit * 0.23, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const tetherGeo = new THREE.BufferGeometry();
    tetherGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));

    // Both cues skip depth testing — being hidden behind a piece is the exact
    // problem they exist to solve. `toneMapped: false` keeps the accent colour
    // itself: the renderer's default ACES curve desaturates a mid-bright green
    // into pale grey, which is wrong for a signal.
    const cueMat = new THREE.MeshBasicMaterial({
      color: SNAP_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const tetherMat = new THREE.LineBasicMaterial({
      color: SNAP_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    return { ringGeo, tetherGeo, cueMat, tetherMat };
  }, [unit]);

  useEffect(() => {
    return () => {
      geometries.forEach((g) => g.dispose());
      material.forEach((m) => m.dispose());
      highlight.forEach((m) => m.dispose());
      overlay.ringGeo.dispose();
      overlay.tetherGeo.dispose();
      overlay.cueMat.dispose();
      overlay.tetherMat.dispose();
    };
  }, [geometries, material, highlight, overlay]);

  const isInterior = (i: number) => {
    const r = Math.floor(i / spec.cols);
    const c = i % spec.cols;
    return r > 0 && r < spec.rows - 1 && c > 0 && c < spec.cols - 1;
  };

  // --- Drag controller -----------------------------------------------------

  /** Project a CSS-pixel screen point onto the z=0 play plane. */
  const projectGround = useCallback(
    (clientX: number, clientY: number, out: THREE.Vector3): boolean => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(GROUND, out) !== null;
    },
    [gl, camera, raycaster],
  );

  /**
   * World-space offset equivalent to `TOUCH_LIFT_PX` up the screen at the
   * pointer's location — how far to slide the piece out from under the finger.
   * Derived by projecting a second screen point instead of hardcoded, so it
   * stays a constant on-screen distance at any zoom or tilt. Clamped because a
   * shallow tilt makes the projected distance blow up near the horizon.
   */
  const fingerOffset = useCallback(
    (clientX: number, clientY: number, pt: THREE.Vector3): { x: number; y: number } => {
      const up = new THREE.Vector3();
      if (!projectGround(clientX, clientY - TOUCH_LIFT_PX, up)) return { x: 0, y: 0 };
      let dx = up.x - pt.x;
      let dy = up.z - pt.z;
      const max = unit * 1.6;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      return { x: dx, y: dy };
    },
    [projectGround, unit],
  );

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
    const touch = e.pointerType === "touch";
    const off = touch ? fingerOffset(e.clientX, e.clientY, pt) : { x: 0, y: 0 };
    drag.current = {
      groupId,
      grabX: g.origin.x - pt.x,
      grabY: g.origin.y - pt.z,
      ptX: pt.x,
      ptY: pt.z,
      touch,
      offX: off.x,
      offY: off.y,
      ease: 0,
      pull: 0,
      hasSnap: false,
      snapX: 0,
      snapY: 0,
      snapGroupId: -1,
    };
    if (controlsRef.current) controlsRef.current.enabled = false;
    gl.domElement.setPointerCapture?.(e.pointerId);
    gl.domElement.style.cursor = "grabbing";
  };

  useEffect(() => {
    const el = gl.domElement;

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const pt = new THREE.Vector3();
      if (!projectGround(ev.clientX, ev.clientY, pt)) return;
      d.ptX = pt.x;
      d.ptY = pt.z;
      // Recomputed per move: the offset depends on where on screen the finger
      // is (perspective) and on any camera change mid-drag.
      if (d.touch) {
        const off = fingerOffset(ev.clientX, ev.clientY, pt);
        d.offX = off.x;
        d.offY = off.y;
      }
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
  }, [gl, controlsRef, projectGround, fingerOffset]);

  // --- Positioning loop ----------------------------------------------------
  useFrame((frame, dt) => {
    const store = useGameStore.getState();
    const st = store.state;
    if (!st) return;
    const d = drag.current;
    const lift = unit * 0.5;
    const edgesOnly = store.edgesOnly;

    // Advance the drag: pointer position -> group origin, then ask core whether
    // releasing here would join anything.
    if (d) {
      const g = st.groups.get(d.groupId);
      if (g) {
        d.ease = Math.min(1, d.ease + dt * 9);
        g.origin.x = d.ptX + d.grabX + d.offX * d.ease;
        g.origin.y = d.ptY + d.grabY + d.offY * d.ease;

        const candidate = findSnapCandidate(st, d.groupId, snapThreshold(st));
        if (candidate) {
          d.snapX = candidate.origin.x;
          d.snapY = candidate.origin.y;
          d.snapGroupId = candidate.targetGroupId;
          d.hasSnap = true;
        }
        d.pull += ((candidate ? 1 : 0) - d.pull) * Math.min(1, dt * 14);
        if (!candidate && d.pull < 0.01) d.hasSnap = false;
      }
    }

    // While a join is in range the dragged group renders at the alignment it
    // would snap to — the piece visibly clicks in before release, so "did that
    // catch?" is answered before letting go. Only the *rendered* offset moves;
    // `origin` still tracks the pointer, so the drop resolves off the real
    // position and preview and outcome cannot disagree.
    let pullX = 0;
    let pullY = 0;
    if (d?.hasSnap) {
      const g = st.groups.get(d.groupId);
      if (g) {
        pullX = (d.snapX - g.origin.x) * d.pull;
        pullY = (d.snapY - g.origin.y) * d.pull;
      }
    }

    const draggingGroup = d?.groupId ?? -1;
    const settle = 1 - 0.78 * (d?.pull ?? 0); // seat it down as it locks in
    // Past this much pull the join is a near certainty, so light both sides of
    // it: the dragged group and the group it would click onto. A marker on the
    // table can't do this job — a piece's tabs reach half a cell beyond its own
    // footprint, so the group covers any footprint drawn under it, and the
    // preview alignment puts it there exactly when the cue matters most.
    const glowing = !!d && d.hasSnap && d.pull > 0.35;
    const glowGroup = glowing && d ? d.snapGroupId : -1;

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
      const target = grabbed ? lift * settle : 0;
      // Ease the lift for a "picked up / settles on drop" feel.
      const k = Math.min(1, dt * 12);
      liftY.current[i] += (target - liftY.current[i]) * k;

      mesh.position.set(
        grabbed ? pos.x + pullX : pos.x,
        liftY.current[i],
        grabbed ? pos.y + pullY : pos.y,
      );

      // Assign only on change: reassigning every frame would churn the renderer's
      // material bookkeeping for no reason.
      const lit = glowing && (grabbed || st.pieceToGroup[i] === glowGroup);
      const want = lit ? highlight : material;
      if (mesh.material !== want) mesh.material = want;
    }

    // --- Touch cues --------------------------------------------------------
    const pulse = 0.5 + 0.5 * Math.sin(frame.clock.elapsedTime * 6);

    // Finger cue: a ring on the contact point plus a tether to the piece, so a
    // touch drag still shows where the pointer actually is once the piece has
    // moved clear of the fingertip.
    const showFinger = !!d && d.touch && !store.completed;
    const ring = fingerRef.current;
    const tether = tetherRef.current;
    if (ring) {
      ring.visible = showFinger;
      if (showFinger && d) ring.position.set(d.ptX, 0.06, d.ptY);
    }
    if (tether) {
      tether.visible = showFinger && (d?.ease ?? 0) > 0.08;
      if (tether.visible && d) {
        const attr = overlay.tetherGeo.attributes.position;
        const arr = attr.array as Float32Array;
        arr[0] = d.ptX;
        arr[1] = 0.06;
        arr[2] = d.ptY;
        // The held point on the piece: pointer + the offset that lifted it.
        arr[3] = d.ptX + d.offX * d.ease + pullX;
        arr[4] = 0.06;
        arr[5] = d.ptY + d.offY * d.ease + pullY;
        attr.needsUpdate = true;
      }
    }
    if (showFinger) overlay.cueMat.opacity = 0.6 + 0.3 * pulse;
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

      {/* Touch cues. Both start hidden; the frame loop places and reveals them. */}
      <mesh
        ref={fingerRef}
        visible={false}
        geometry={overlay.ringGeo}
        material={overlay.cueMat}
        renderOrder={11}
      />
      <lineSegments
        ref={tetherRef}
        visible={false}
        geometry={overlay.tetherGeo}
        material={overlay.tetherMat}
        renderOrder={10}
      />
    </group>
  );
}
