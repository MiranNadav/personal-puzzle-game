"use client";

import { forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface CameraRigProps {
  /** Point the camera orbits — centre of the table. */
  target: [number, number, number];
  /** Rough table span, used to clamp dolly distance. */
  span: number;
}

/**
 * Camera scheme from plan Q16: perspective, tilt 30°–90°, YAW LOCKED (azimuth
 * pinned to 0 — a yawed camera hides the axis-aligned piece grid and makes the
 * game harder for no benefit). No damping/inertia (fights precise placement).
 * Buttons remapped so LMB/1-finger on empty table PANS and RMB/2-finger tilts.
 */
export const CameraRig = forwardRef<OrbitControlsImpl, CameraRigProps>(function CameraRig(
  { target, span },
  ref,
) {
  return (
    <OrbitControls
      ref={ref}
      target={target}
      makeDefault
      enableDamping={false}
      enableRotate
      enablePan
      enableZoom
      // Tilt (polar): 0 = straight down (90° from horizontal), PI/3 = 30° above horizontal.
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 3}
      // Yaw (azimuth) locked at 0.
      minAzimuthAngle={0}
      maxAzimuthAngle={0}
      // Dolly clamp: near ~ close inspection, far ~ fit whole table.
      minDistance={span * 0.25}
      maxDistance={span * 2.2}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  );
});
