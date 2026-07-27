"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { HUD } from "@/ui/HUD";
import { UploadDropzone } from "@/ui/UploadDropzone";
import { DifficultyPicker, DEFAULT_TARGET } from "@/ui/DifficultyPicker";
import { loadImageFile, makeSampleImage, type LoadedTexture } from "@/render/textures";

// The scene is WebGL-only; never server-render it.
const PuzzleCanvas = dynamic(() => import("@/render/PuzzleCanvas").then((m) => m.PuzzleCanvas), {
  ssr: false,
});

/**
 * M1 (plan Q20): a complete, playable game that lives entirely in the browser
 * and forgets everything on refresh. Flow is a two-phase local state machine —
 * `setup` (choose image + difficulty) → `play` (the R3F scene + HUD). No server,
 * no persistence; those arrive in M2.
 */
export default function Home() {
  const [img, setImg] = useState<LoadedTexture | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetCount, setTargetCount] = useState(DEFAULT_TARGET);
  const [seed, setSeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dispose the current texture / preview URL on replace or unmount.
  useEffect(() => () => img?.texture.dispose(), [img]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const setImage = useCallback((loaded: LoadedTexture, preview: string | null) => {
    setImg((prev) => {
      if (prev && prev !== loaded) prev.texture.dispose();
      return loaded;
    });
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return preview;
    });
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setLoadError(null);
      try {
        const loaded = await loadImageFile(file);
        setImage(loaded, URL.createObjectURL(file));
      } catch {
        setLoadError("Couldn't read that image. Try a JPG or PNG.");
      } finally {
        setBusy(false);
      }
    },
    [setImage],
  );

  const onSample = useCallback(() => {
    setLoadError(null);
    setImage(makeSampleImage(), null);
  }, [setImage]);

  const start = useCallback(() => {
    setSeed((s) => s + 1);
    setPlaying(true);
  }, []);

  const onDifficulty = useCallback((count: number) => {
    setTargetCount(count);
    setSeed((s) => s + 1);
  }, []);
  const onPlayAgain = useCallback(() => setSeed((s) => s + 1), []);
  const onNewImage = useCallback(() => setPlaying(false), []);

  const aspect = img ? img.width / img.height : 1;

  if (playing && img) {
    return (
      <main className="relative h-dvh w-dvw overflow-hidden">
        <PuzzleCanvas
          texture={img.texture}
          imgW={img.width}
          imgH={img.height}
          targetCount={targetCount}
          seed={seed}
        />
        <HUD
          targetCount={targetCount}
          onDifficulty={onDifficulty}
          onPlayAgain={onPlayAgain}
          onNewImage={onNewImage}
        />
      </main>
    );
  }

  return (
    <main className="grid h-dvh w-dvw place-items-center bg-neutral-950 p-6 text-white">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Jigsaw</h1>
          <p className="mt-1 text-sm text-white/60">
            Upload an image and assemble it, piece by piece.
          </p>
        </div>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Puzzle preview"
            className="max-h-64 w-full rounded-2xl object-contain"
          />
        ) : img ? (
          <div className="grid h-40 place-items-center rounded-2xl bg-white/5 text-sm text-white/50">
            Sample image ready
          </div>
        ) : null}

        <UploadDropzone onFile={onFile} busy={busy} error={loadError} />

        {img && (
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-white/70">Difficulty</span>
            <DifficultyPicker aspect={aspect} value={targetCount} onChange={setTargetCount} />
            <button
              onClick={start}
              className="mt-1 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white transition hover:bg-emerald-400"
            >
              Start puzzle
            </button>
          </div>
        )}

        {!img && (
          <button
            onClick={onSample}
            className="text-sm text-white/50 underline underline-offset-4 hover:text-white/80"
          >
            or try a sample image
          </button>
        )}
      </div>
    </main>
  );
}
