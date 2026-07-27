# CLAUDE.md

## Purpose

Web app that turns an uploaded image into a jigsaw puzzle the user assembles by dragging pieces in a three.js scene. Pieces click together into groups; progress persists across sessions; puzzles are shareable by unlisted link.

**Status: greenfield.** No code yet. Full design in `plans/puzzle-game-plan.md` — read it before implementing anything. Build order is M0–M5 (§Q20); M0 has a hard gate that must pass before later milestones start.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, TypeScript |
| API | Next Route Handlers (no separate backend service) |
| 3D | `three` + `@react-three/fiber` + `@react-three/drei` |
| Client state | Zustand |
| DB | Postgres + Drizzle |
| Auth | Auth.js (NextAuth) v5, Google only |
| Blob storage | Cloudflare R2, presigned direct-to-R2 upload |
| Image processing | `sharp` (Node runtime routes only, never Edge) |
| Styling | Tailwind |
| Tests | Vitest, `fast-check`, Playwright |
| Deploy | Vercel |

## Architecture invariants

Violating any of these causes bugs that are hard to see and expensive to unwind.

**`src/core/**` is pure TypeScript with zero dependencies.** No `react`, `three`, `next`, or DOM APIs. Enforced by an ESLint `no-restricted-imports` rule. All geometry, union-find, snapping, scatter, and serialization live here so they're testable without a GPU and the renderer stays replaceable.

**`core/geometry/shape.ts` returns abstract path commands, not `THREE.Shape`.** The `render/` layer translates them. This is what keeps `core/` dependency-free.

**Piece geometry is a pure function of `(seed, rows, cols)`.** The DB stores those three values, never path data. Shared links and reloads depend on regenerating byte-identical geometry on a different machine — determinism is load-bearing, not a nicety.

**Interior edges are generated once and shared between neighbours.** Piece `(r,c)`'s right edge is the exact inverse of `(r,c+1)`'s left edge. Generating edges per-piece independently produces pieces that don't fit, and the failure only appears at certain seeds.

**Persisted state stores groups, not pieces.** A piece's position is `group.origin + gridOffset(pieceIndex)`. Storing per-piece coordinates admits states where two pieces in one group disagree about where the group is.

**The drag loop reads Zustand via `useGameStore.getState()` inside `useFrame` — never a hook subscription.** Subscribing re-renders React 60×/sec while dragging up to 300 meshes.

**All gameplay happens on the z=0 plane.** 3D is presentation only (thickness, bevels, shadows, lighting). Game logic is 2D grid math.

**Uploaded images are re-encoded server-side with `sharp` regardless of what the client sent**, and validated by magic bytes rather than `Content-Type`. The client is untrusted and can POST arbitrary bytes to the endpoint directly. Re-encoding also strips EXIF GPS data.

**Game state writes are version-checked.** PUT includes the version it read; the server rejects stale writes with 409. Without this, two open tabs silently destroy each other's progress.

## Conventions

- Anonymous players are ordinary `players` rows with null credentials — not a special case. Sign-in attaches credentials to the existing row; there is no merge path.
- Create anonymous player rows lazily, on first meaningful action (upload / start game), never on page view. Share links get scraped by link-preview bots.
- `puzzles` (shareable definition) and `games` (per-player state) are separate. Opening a shared puzzle creates a new `games` row for that visitor.
- `rotation` exists in the state model and is always 0 in v1. Keep the field; don't build the mechanic.

## Commands

None yet — project not scaffolded.
