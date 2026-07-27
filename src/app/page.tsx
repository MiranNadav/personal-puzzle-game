"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { HUD } from "@/ui/HUD";

// The scene is WebGL-only; never server-render it.
const PuzzleCanvas = dynamic(() => import("@/render/PuzzleCanvas").then((m) => m.PuzzleCanvas), {
  ssr: false,
});

/**
 * M0 vertical spike (plan Q20): hardcoded demo image, drag + snap + group merge
 * in the R3F scene, no backend / upload / auth / persistence. The difficulty
 * buttons exist so the perf gate ("bump to 300, check FPS on a real phone") is
 * one tap away.
 */
export default function Home() {
  const [targetCount, setTargetCount] = useState(24);
  const [seed, setSeed] = useState(1);

  const onPlayAgain = useCallback(() => setSeed((s) => s + 1), []);
  const onDifficulty = useCallback((count: number) => {
    setTargetCount(count);
    setSeed((s) => s + 1);
  }, []);

  return (
    <main className="relative h-dvh w-dvw overflow-hidden">
      <PuzzleCanvas targetCount={targetCount} seed={seed} />
      <HUD targetCount={targetCount} onDifficulty={onDifficulty} onPlayAgain={onPlayAgain} />
    </main>
  );
}
