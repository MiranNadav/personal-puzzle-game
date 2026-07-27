"use client";

import { deriveGrid } from "@/core";

export interface Tier {
  label: string;
  /** Target piece count; the realized count drifts with aspect (plan Q6). */
  count: number;
}

/** Shared by the setup picker and the in-game HUD so tiers can't drift apart. */
export const TIERS: Tier[] = [
  { label: "Small", count: 24 },
  { label: "Medium", count: 100 },
  { label: "Large", count: 300 },
];

export const DEFAULT_TARGET = 100;

/**
 * Difficulty chooser shown before play. Because the grid is aspect-derived, the
 * realized piece count differs from the target, so each tier previews its true
 * count for the current image.
 */
export function DifficultyPicker({
  aspect,
  value,
  onChange,
}: {
  aspect: number;
  value: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="flex gap-2">
      {TIERS.map((t) => {
        const { rows, cols } = deriveGrid(t.count, aspect);
        const active = value === t.count;
        return (
          <button
            key={t.count}
            onClick={() => onChange(t.count)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-4 py-3 transition ${
              active
                ? "border-emerald-400 bg-emerald-500/20 text-white"
                : "border-white/10 bg-white/5 text-white/80 hover:border-white/30 hover:bg-white/10"
            }`}
          >
            <span className="text-sm font-semibold">{t.label}</span>
            <span className="text-xs opacity-70 tabular-nums">{rows * cols} pieces</span>
          </button>
        );
      })}
    </div>
  );
}
