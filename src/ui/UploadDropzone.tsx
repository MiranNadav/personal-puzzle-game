"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES } from "@/render/textures";

/**
 * Drag-and-drop / click-to-pick image upload (plan M1: client-only, no server).
 * Does cheap pre-checks (a File is present, it claims an image type, it's under
 * the size cap); the authoritative check is the decode in `loadImageFile`, whose
 * failure the parent surfaces via `error`.
 */
export function UploadDropzone({
  onFile,
  busy,
  error,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const accept = useCallback(
    (file: File | undefined | null) => {
      setLocalError(null);
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setLocalError("That doesn't look like an image file.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setLocalError("Image is too large (max 25 MB).");
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  const shownError = localError ?? error ?? null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-10 py-14 text-center transition ${
          dragOver
            ? "border-emerald-400 bg-emerald-500/10"
            : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"
        } ${busy ? "cursor-wait opacity-60" : "cursor-pointer"}`}
      >
        <span className="text-base font-semibold text-white">
          {busy ? "Loading image…" : "Drop an image here"}
        </span>
        <span className="text-sm text-white/60">or click to choose a file</span>
        <span className="text-xs text-white/40">JPG or PNG · up to 25 MB</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = ""; // allow re-picking the same file
        }}
      />

      {shownError && <p className="text-sm text-rose-400">{shownError}</p>}
    </div>
  );
}
