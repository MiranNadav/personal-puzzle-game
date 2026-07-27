"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { TIERS } from "./DifficultyPicker";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function HUD({
  targetCount,
  onDifficulty,
  onPlayAgain,
  onNewImage,
}: {
  targetCount: number;
  onDifficulty: (count: number) => void;
  onPlayAgain: () => void;
  onNewImage: () => void;
}) {
  const progress = useGameStore((s) => s.progress);
  const moves = useGameStore((s) => s.moves);
  const completed = useGameStore((s) => s.completed);
  const edgesOnly = useGameStore((s) => s.edgesOnly);
  const ghost = useGameStore((s) => s.ghost);
  const epoch = useGameStore((s) => s.epoch);
  const spec = useGameStore((s) => s.spec);
  const spreadOut = useGameStore((s) => s.spreadOut);
  const lightTheme = useGameStore((s) => s.lightTheme);
  const toggleEdgesOnly = useGameStore((s) => s.toggleEdgesOnly);
  const toggleGhost = useGameStore((s) => s.toggleGhost);
  const toggleTheme = useGameStore((s) => s.toggleTheme);

  const pieceCount = spec ? spec.rows * spec.cols : 0;

  // Client-side timer, paused while the tab is hidden, frozen on completion (Q14).
  const [display, setDisplay] = useState(0);
  const accRef = useRef(0);
  useEffect(() => {
    accRef.current = 0;
    setDisplay(0);
  }, [epoch]);
  useEffect(() => {
    if (completed) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) {
        accRef.current += now - last;
        setDisplay(accRef.current);
      }
      last = now;
    }, 250);
    return () => window.clearInterval(id);
  }, [completed, epoch]);

  return (
    <>
      {/* Top-left status */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2 text-white">
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-black/50 px-3 py-2 backdrop-blur">
          <span className="tabular-nums text-lg font-semibold">{fmt(display)}</span>
          <span className="text-xs opacity-70">
            {Math.round(progress * 100)}% · {moves} moves · ~{pieceCount} pcs
          </span>
        </div>
        <div className="pointer-events-auto h-1.5 w-56 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Top-right: difficulty (drives the M0 perf gate) + new image */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-black/50 p-1 backdrop-blur">
          {TIERS.map((t) => (
            <button
              key={t.count}
              onClick={() => onDifficulty(t.count)}
              className={`rounded px-3 py-1.5 text-xs font-medium text-white transition ${
                targetCount === t.count ? "bg-emerald-500" : "hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={onNewImage}
          className="rounded-lg bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-white/10"
        >
          New image
        </button>
      </div>

      {/* Bottom findability toolbar (plan Q13) */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-xl bg-black/50 p-2 backdrop-blur">
        <button
          onClick={spreadOut}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
        >
          Spread out
        </button>
        <button
          onClick={toggleEdgesOnly}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
            edgesOnly ? "bg-emerald-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          Edges only
        </button>
        <button
          onClick={toggleGhost}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
            ghost ? "bg-emerald-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          Ghost
        </button>
        <button
          onClick={toggleTheme}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
            lightTheme ? "bg-emerald-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {lightTheme ? "Light" : "Dark"}
        </button>
      </div>

      {/* Completion panel (plan Q18) */}
      {completed && (
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-neutral-900/95 px-10 py-8 text-center text-white shadow-2xl">
            <h2 className="text-2xl font-bold">Solved!</h2>
            <p className="text-sm opacity-80">
              {fmt(display)} · {moves} moves · {pieceCount} pieces
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={onNewImage}
                className="rounded-lg bg-white/10 px-6 py-2.5 font-medium hover:bg-white/20"
              >
                New image
              </button>
              <button
                onClick={onPlayAgain}
                className="rounded-lg bg-emerald-500 px-6 py-2.5 font-medium hover:bg-emerald-400"
              >
                Play again
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
