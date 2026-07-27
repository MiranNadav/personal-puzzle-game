"use client";

/**
 * Lighting tuned so extruded pieces read as physical cardboard — the make-or-
 * break of a 3D jigsaw (plan Q12). One key directional light casts the shadows
 * that sell thickness; fill + ambient keep shadowed faces from going muddy.
 */
export function Lighting({ span }: { span: number }) {
  const d = span * 1.2;
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.4} groundColor="#444" />
      <directionalLight
        position={[span * 0.6, span * 1.3, span * 0.4]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={span * 4}
        shadow-camera-left={-d}
        shadow-camera-right={d}
        shadow-camera-top={d}
        shadow-camera-bottom={-d}
        shadow-bias={-0.0005}
      />
    </>
  );
}
