# 3D Jigsaw Puzzle Web App — Design Plan

Status: **design complete.** Q1–Q20 locked. Not yet implemented.

Last updated: 2026-07-25

---

## 1. Product summary

A web app where a user uploads an image, the app generates a jigsaw puzzle from it, and the user assembles it by dragging pieces in a 3D scene. Puzzles persist across sessions and can be shared by unlisted link.

---

## 2. Decisions

### Q1 — Backend

**Full-stack with a real backend.** Chosen over client-only because persistence is a core requirement, not an add-on.

### Q2 — What persists

All four categories:

1. **Uploaded images** — blob storage.
2. **Puzzle definitions** — the shareable, replayable artifact.
3. **In-progress game state** — close the tab, come back, continue.
4. **Completion records** — time, moves, date.

### Q3 — Identity: anonymous-first, optional upgrade

- Every visitor gets a real `players` row. Play, upload, and persist all work while logged out.
- `players` has nullable `email` / `provider_id`. Anonymous players are not a special case — they are ordinary rows without credentials.
- Sign-in **attaches** OAuth credentials to the current anonymous row. No merge algorithm, no dual-identity code path.
- Edge case — anonymous player on a second device signs into an existing account: **do not merge.** Prompt "You have N unsaved puzzles on this device. Keep them?" → yes reassigns those rows' `player_id` (one `UPDATE`); no orphans them.
- **Accepted tradeoff:** anonymous scores are unverifiable. Stats are "fun", not competitive. Server-authoritative move validation is explicitly out of scope.

### Q4 — Undo / replay

- **Snapshot is the source of truth.**
- **No undo in v1.** A jigsaw has no destructive action — a misplaced piece is fixed by dragging it again. Undo is a reflex request, not a real need here.
- **Replay (solve timelapse) deferred post-v1.** When wanted, add an append-only move log alongside the snapshot. Because the snapshot stays authoritative, this is a pure addition, not a rewrite.

### Q5 — Piece geometry: jigsaw visuals, grid logic

Pieces *look* like real jigsaw pieces (tabs and blanks) but every piece belongs to a grid cell `(row, col)`, and all game logic runs in grid coordinates.

- Each interior edge gets a random tab direction (in/out) plus a shape seed. **Edges are generated once and shared between neighbours** — piece `(r,c)`'s right edge is the exact inverse of `(r,c+1)`'s left edge. Generating per-piece independently produces edges that don't fit; this is the central trick.
- Piece surface = image cropped to its cell plus overhang margin (tabs protrude ~20% of cell size), masked by the piece path.
- **The entire geometry is a pure function of `(seed, rows, cols)`.** The server stores three numbers, not a path dump, and identical geometry regenerates on any client.

Puzzle definition record: `{ imageId, rows, cols, seed }`.

### Q6 — Difficulty tiers

| Tier | Target pieces |
|---|---|
| Small | ~24 |
| Medium | ~100 |
| Large | ~300 |

- Each step is ~3× harder, which reads as a real difficulty jump (2× does not).
- **`rows`/`cols` derive from image aspect ratio**, never fixed. Given target count `N` and aspect `a`: `cols = round(sqrt(N * a))`, `rows = round(N / cols)`. Actual count drifts from target — the UI shows the real number ("~48 pieces").
- Ceiling held at 300 even though WebGL could do more. Binding constraints are **mobile GPU cost of 300 shadow-casting meshes** and source resolution (at 2400px source, 300 pieces gives ~140px per piece; more would look mushy zoomed in).
- An XL tier later needs higher source resolution *and* a shadows-off quality toggle — a bundle of changes, not a number bump.

### Q7 — Snapping: piece-to-piece joining

Real jigsaw behaviour, not slot-filling.

- Pieces scatter on an open table. Drag piece A near grid-neighbour B; if roughly aligned, they click together and become a **group** that drags as one rigid unit. Groups merge with groups.
- Union-find with path compression over pieces (~40 lines).
- On drop: test the dragged group's pieces against adjacent grid neighbours not already in the group. Any within snap threshold (~20% of piece size) → align, merge, snap the whole group into place.
- Group position stored once; piece offsets within a group are fixed grid deltas. Merging is "reparent B's pieces to A's group and shift by delta."
- **Completion condition:** union-find contains one set of size `rows * cols`.
- Table is ~2× the assembled puzzle's bounding box. Zoom-to-fit on load.
- No fixed board outline — the assembly floats wherever the player builds it.

Rejected target-slot snapping: materially worse product, and group membership infects the data model (`{x, y, groupId}`, group-relative positions), so building slots first would mean rewriting the state layer.

### Q8 — Rotation: deferred

- **No rotation in v1**, but `rotation` stays in the piece/group state model from day one (always 0), so adding it later touches the snap predicate and input layer, not the schema or persistence format.
- Reason: with grouping in play, rotation adds a rotated basis to every coordinate calculation, a rotation-match condition to snap detection, rigid group rotation about a pivot, and mobile gesture disambiguation against pinch-zoom. High cost; mostly adds tedium rather than depth.
- **Known visual cost:** see Q13 — the scatter is axis-aligned and reads as slightly artificial.

### Q9 — Visibility: unlisted share links

- `/puzzle/:id` works for anyone holding the URL. Not indexed, not browsable. No public gallery — that would mean owning an NSFW/illegal-content moderation pipeline.
- **Share the puzzle definition, not the game state.** Opening a shared link creates a new `games` row for the visitor pointing at the shared `puzzles` row. Otherwise two people fight over one board.
- Therefore `puzzles` and `games` are separate tables. A player may have multiple games on one puzzle (replay). Completion records hang off `games`.
- Moderation exposure with unlisted-only links equals "someone deliberately sent you a bad image" — the same risk any messaging app carries. Accepted.

### Q10 — Image ingestion pipeline

**Client, before upload:**

- Decode via `createImageBitmap(file, { imageOrientation: 'from-image' })` to honour EXIF rotation. Skipping this is the classic photo-upload bug — portrait phone photos arrive sideways.
- Downscale longest edge to **2400px**, export **WebP q0.85**. A typical 5MB phone photo becomes ~400KB. At 300 pieces this yields ~140px per piece.
- Reject undecodable files with a clear message. **HEIC decodes only in Safari** — the error text must say so explicitly, since iPhone-native files are a common input.

**Server:**

- Validate **magic bytes**, not `Content-Type` (the header is attacker-controlled).
- **Re-encode with `sharp` regardless of what the client sent.** The client is untrusted and can POST arbitrary bytes directly. Re-encoding neutralises malformed/polyglot image payloads and strips EXIF — including GPS coordinates users don't know their photos carry.
- Emit two derivatives: 2400px play image, 400px thumbnail.
- Hard cap request body ~10MB.

**Abuse limits** (required — anonymous users can upload):

- Per-player quota: 20 images anonymous, higher once authenticated.
- Per-IP upload rate limit.
- Without these the endpoint is free unlimited object storage for anyone who finds it.

**Aspect handling:** no crop UI in v1. Clamp the aspect ratio used for grid computation to 2:1 so panoramas still produce sane grids; letterbox the remainder.

**Deferred:** background removal, crop UI, filters, NSFW classifier.

### Q11 — Stack

Next.js + Vercel, single repo, single deploy.

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router, TypeScript | Client-heavy game plus ~8 API routes. One deploy, no CORS, no separate backend process. |
| Backend | Next Route Handlers | The API is upload / create puzzle / get puzzle / save state / list library / record completion. Not a NestJS-sized problem. |
| DB | Postgres (Neon or Supabase) | — |
| ORM | Drizzle | Typed SQL without the Prisma engine binary, which is real friction on serverless cold starts. |
| Auth | Auth.js (NextAuth) v5 | Handles the Q3 anon→OAuth upgrade in the `signIn` callback. |
| Blob storage | Cloudflare R2 | S3-compatible, zero egress. Image bytes ship on every puzzle load — egress is the cost that bites. |
| Image processing | `sharp` | Node runtime route, not Edge. |
| Client state | Zustand | High-frequency mutation during drag; Context+reducer re-renders too broadly, Redux is overkill. |
| Styling | Tailwind | — |
| 3D | `three` + `@react-three/fiber` + `@react-three/drei` | R3F keeps the scene declarative and composes with the React shell; drei supplies camera controls, shadows, loaders. |
| Tests | Vitest + `fast-check` + Playwright | See Q19. |

**Not NestJS + separate SPA:** two deploys, CORS, shared-types drift, and a DI framework guarding eight endpoints. If a real backend emerges (multiplayer, job queues, WebSockets), that is the moment to split — Route Handlers port to controllers cleanly.

**Upload path:** presigned-URL **direct-to-R2** upload. The browser PUTs straight to storage; the server only sees the resulting key. Sidesteps Vercel's ~4.5MB serverless body limit and keeps image bytes off the function.

### Q12 — 3D: presentation, not mechanic

**Perspective camera over a table. Pieces are extruded meshes with thickness, bevelled edges, and cast shadows. They lift and tilt when grabbed and settle on drop. Every piece stays on the z=0 plane, and all game logic runs in plane coordinates.**

Rejected true-3D mechanics (pieces tumbling in space, 6DoF orientation): jigsaw is a 2D spatial-reasoning task, and adding rotational axes converts it from "where does this go" into "fighting a 3D manipulator." It is why 3D jigsaw games are rare and unloved.

Everything from Q5/Q7 survives unchanged: the bezier edge path becomes a `THREE.Shape` fed to `ExtrudeGeometry` with a bevel. Grid logic, seeds, union-find, and persistence format are untouched.

What the 3D pivot changed:

| Previously | Now |
|---|---|
| DOM pieces, one `<canvas>` each | One WebGL scene, one mesh per piece |
| Alpha-sample hit-testing | `THREE.Raycaster` — cleaner, built in |
| CSS-transform zoom/pan viewport | Camera controls — simpler than the DOM version |
| ~300-piece ceiling from DOM cost | DOM ceiling gone; mobile GPU is the new constraint |
| React re-render concerns during drag | Game loop lives in `useFrame`, outside React |

Known hard areas: material/lighting tuning so pieces read as physical cardboard (this is where 3D jigsaws live or die visually — flat unlit meshes look worse than good 2D); shadow quality vs cost; mobile GPU budget at 300 shadow-casting meshes.

### Q13 — Starting layout and findability

At 300 pieces, **finding** a piece is a bigger UX problem than dragging one.

**Starting layout:** loose pieces scatter face-up in a margin ring around a clear central assembly zone. Position jitter only, minimal overlap (Poisson-disc-style placement so nothing is fully buried).

**Consequence of no-rotation (Q8):** every scattered piece is axis-aligned, which reads as slightly artificial — less "pile of pieces", more grid. Visual-only random rotation is not an option: it would imply a rotate mechanic that doesn't exist and players would try to use it. Accepted price.

**Findability aids shipping in v1:**

1. **"Spread out" button** — re-scatters loose pieces with no overlap. Highest-value affordance; pieces inevitably stack.
2. **Edges-only filter** — dim/hide interior pieces so the border can be done first. That is how humans actually solve jigsaws, and it makes 300 feel tractable.
3. **Ghost preview toggle** — source image shown faintly under the assembly area.

**Deferred:** sorting tray, colour-bucket filters, "place one piece for me" hint.

### Q14 — Save format and cadence

**Persist groups, not pieces:**

```jsonc
{
  "v": 1,
  "groups": [ { "id": 0, "x": 0, "y": 0, "pieces": [0, 1, 14] } ],
  "elapsedMs": 0,
  "movesCount": 0,
  "completedAt": null
}
```

A piece's world position is `group.origin + gridOffset(pieceIndex)`. Storing per-piece coordinates would be redundant *and* corruptible — it would admit states where two pieces in one group disagree about where the group is. Loose pieces are groups of size 1. Union-find state and position state become the same object, so they cannot desync. ~300 pieces ≈ 10–15KB JSON, stored as `jsonb` on `games`.

**Cadence:**

- Debounce **2s after last drop**, then PUT.
- Flush on `visibilitychange` → hidden via **`navigator.sendBeacon`**. Not `beforeunload` — it does not fire reliably on mobile Safari, which is exactly where tabs get closed.
- **Synchronous `localStorage` snapshot on every drop** as crash insurance (~1ms). Server is the sync target, local is the safety net. On load, if local is newer than server, offer to restore. Prevents this app's worst possible bug: "I spent 40 minutes and lost it."

**Conflict handling:** monotonic `version` on the game row. PUT includes the version it read; server rejects stale writes with 409; client reloads and warns. Last-write-wins without a version check silently destroys progress when the same game is open in two tabs.

**Timer:** `elapsedMs` accumulated client-side, paused while the tab is hidden. Unverifiable server-side — consistent with Q3.

### Q15 — Project structure

**Single Next app with an enforced framework-free `core/`.** All the risk lives in pure functions — edge generation, grid derivation, union-find, snap predicates, scatter, serialization. Kept free of `three`/`react`/`next`, they're unit-testable in milliseconds and the 3D layer becomes a replaceable adapter.

Enforced with an ESLint `no-restricted-imports` rule banning `react`/`three`/`next` inside `src/core/**` — a build error, which is the only kind of boundary that survives.

Rejected a pnpm monorepo: same boundary, but two build steps and workspace tooling for one deployable.

```
src/
  core/                      # PURE TS. zero deps. no react/three/dom/next.
    rng.ts                   # seeded PRNG — determinism source
    geometry/
      grid.ts                # (targetCount, aspect) -> {rows, cols}
      edges.ts               # shared tab/blank edges; neighbour-inverse pairing
      shape.ts               # piece outline as abstract path commands
    game/
      state.ts               # GameState types + factory
      groups.ts              # union-find
      snap.ts                # snap predicate + group merge
      scatter.ts             # initial layout
      complete.ts
      serialize.ts           # runtime state <-> v1 save format
  render/                    # three.js / R3F adapter
    PuzzleCanvas.tsx
    PieceMesh.tsx
    usePieceGeometry.ts      # core path cmds -> THREE.Shape -> ExtrudeGeometry
    useDragController.ts     # raycast -> plane projection -> core snap
    CameraRig.tsx
    lighting.tsx
    textures.ts              # per-piece UVs into one shared texture
  ui/                        # React chrome, no 3D
    UploadDropzone.tsx
    DifficultyPicker.tsx
    HUD.tsx                  # timer, progress, spread-out, edges-only, ghost
  store/
    gameStore.ts             # zustand, holds core GameState
    persistence.ts           # debounce, sendBeacon, localStorage, version
  db/
    schema.ts                # drizzle
    queries/
  lib/
    r2.ts, image.ts, auth.ts
  app/                       # Next App Router — thin
    puzzle/[id]/page.tsx
    library/page.tsx
    api/...
```

Two structural specifics that are easy to get wrong later:

1. **`core/geometry/shape.ts` returns abstract path commands** (`{type:'bezier', ...}` tuples), *not* a `THREE.Shape`. That is what keeps core dependency-free, and it lets the same path data drive a server-side thumbnail render or a 2D fallback.
2. **The drag loop reads the store via `useGameStore.getState()` inside `useFrame`, never via a hook subscription.** Subscribing re-renders React 60×/sec while dragging 300 meshes. This is *the* R3F performance mistake, and it is structural rather than a tuning knob.

### Q16 — Camera scheme

**Yaw is locked by default** — this trades some "3D feel" for playability, deliberately. Yaw breaks the correspondence between screen-space and grid-space; since all pieces are axis-aligned in world space (Q8), a yawed camera makes that alignment invisible and the game meaningfully harder for zero benefit.

- **Perspective camera, default tilt ~60° from horizontal** — enough to read piece thickness, bevels, and shadows, while keeping the board legible.
- **Tilt adjustable 30°–90°.** 90° is straight-down, which people will use for precision work.
- **Yaw locked at 0**, optional unlock in settings, plus a "reset view" button. Never on a default gesture.
- **Pan bounded to the table** plus margin. Unbounded pan means players lose the puzzle off-screen.
- **Dolly clamped** — near limit ~1 piece filling a third of the screen, far limit zoom-to-fit-table.
- **No inertia/momentum on pan.** Feels nice in map apps, actively fights you when placing a piece.

Gesture mapping:

| Input | Desktop | Mobile |
|---|---|---|
| Grab piece | LMB drag on piece | 1-finger drag **on a piece** |
| Pan | LMB drag on empty table, or MMB | 1-finger drag **on empty table** |
| Dolly | Wheel | Pinch |
| Tilt | RMB drag vertical | 2-finger vertical drag |

The one-finger case resolves by raycasting on `pointerdown` — hit a piece, you're dragging; miss, you're panning. No modal state, no gesture ambiguity.

### Q17 — Auth providers and anon session mechanics

**Google only for v1.** Widest coverage; GitHub signals "developer tool", which this isn't. **No email/password** — password hashing, reset flows, verification email infra, and breach liability, all to serve users who could click one button. Magic links deferred (needs email sending). Auth.js makes adding a provider a config block, so this is reversible.

**Session mechanics:**

- JWT session strategy (not DB sessions) — no session table, no DB round-trip per request on serverless.
- Session carries `playerId`. On OAuth sign-in the callback attaches `provider_id`/`email` to the **existing** `playerId` row rather than creating a new one. This is the Q3 upgrade path, implemented in the `signIn` callback.
- Cookie: `httpOnly`, `sameSite=lax`, `secure`, 1-year expiry. Long expiry matters — it is the anonymous player's only claim on their library.

**Create anonymous players lazily.** Minting a `players` row per page view lets crawlers and link-preview bots fill the table — and public share links (Q9) mean every shared URL gets scraped by Slack/Discord/Twitter unfurlers. Create the row on **first meaningful action** (upload an image, or start a game), not on page load.

**Collision case, concretely:** anonymous player with data signs into a Google account that already has a `players` row. The `signIn` callback detects both rows exist, does not merge, and returns a flag routing the client to the "keep your N local puzzles?" prompt. Yes → `UPDATE` those rows' `player_id` to the authenticated one, then delete the empty anon row.

### Q18 — Completion moment and stats surface

**Progress metric:** `progress = (pieceCount - groupCount) / (pieceCount - 1)` — the fraction of joins made. At start every piece is its own group → 0%; at the end one group → 100%. Free from the existing union-find, and it reflects real progress (joining two large clusters is worth more than placing one piece, which is true).

**Completion moment:** final snap → pieces settle, camera eases to a top-down fit of the finished image, a light sweep passes across the surface. Then a panel: time, moves, piece count. Two actions — **Play again** (same image, *new seed*, genuinely different puzzle) and **Share**. No confetti; the image is the reward and shouldn't be covered.

**Stats surface, v1:**

- **Library page:** thumbnail grid. In-progress puzzles show a progress ring; completed show best time.
- **Per-puzzle personal best:** best time for that puzzle at that difficulty.
- Nothing else.

**No leaderboards in v1.** Q3 established anonymous times are unverifiable, and a leaderboard beatable by editing a JSON payload is worse than none — it invites cheating it cannot detect. A later honest version would be aggregate: "5 people have solved this — median 14m."

Needs no schema beyond `games` (`completed_at`, `elapsed_ms`, `moves_count`).

### Q19 — Testing strategy

The `core/` boundary pays off here: the risky logic is pure and testable without a GPU.

**1. Unit tests on `core/` — Vitest.** Where the value is.
- Edge pairing invariant: every interior edge of `(r,c)` is the exact inverse of its neighbour's facing edge.
- Determinism: same `(seed, rows, cols)` → byte-identical geometry. Load-bearing — shared links and reloads both depend on regenerating identical pieces on a different machine.
- Tiling: piece bodies exactly cover the source rect, no gaps, no double-cover.
- Union-find, snap predicate, completion condition, scatter non-overlap.
- `serialize` round-trip is identity.

**2. Property-based testing with `fast-check`** on the geometry invariants specifically — worth the dependency here and nowhere else. Random seeds and grid dimensions, assert edges always pair and pieces always tile. Catches the bug class you *cannot* see by looking: a 0.3px edge mismatch on one of 300 pieces at one random seed. You'd ship it, and one user in fifty would get two pieces that never quite click.

**3. Integration tests on API routes** against a test Postgres, focused on real consequences: the version-conflict 409 path (Q14), anon→auth attach and the collision case (Q17), upload validation rejecting bad magic bytes (Q10), quota enforcement.

**4. E2E with Playwright — non-3D flows only.** Upload → puzzle created → appears in library; sign-in attaches to the anon player; reload restores state.

**Explicitly not tested:** the drag interaction through E2E — driving WebGL pointer events in headless Chrome is flaky, slow, and tests the harness more than the app. `useDragController` delegates to pure `core` functions tested with synthetic coordinates; the untested remainder is "does the raycast hit the right mesh", which is three.js's job and visible within two seconds of opening the page.

**Also skipped:** visual regression testing. Rendering differs across GPUs; flaky snapshot diffs would cost more than they catch.

### Q20 — Build order

**Principle: the risk isn't the CRUD, it's whether a 3D jigsaw feels good.** Upload/auth/DB are known quantities. The unknown is piece geometry, snap feel, and WebGL perf — so that goes first, with nothing attached.

**M0 — Vertical spike. No backend, no upload, no auth.**
Hardcoded bundled image, hardcoded 24 pieces. `core/` geometry + R3F scene + drag + snap + group merge + camera rig. Nothing persists.

> **Gate — do not proceed until both hold:**
> 1. It feels good. The click-together is satisfying; pieces read as physical.
> 2. Bump the constant to 300 and check FPS **on a real phone**, not desktop Chrome. If 300 shadow-casting meshes tank a real device, that surfaces here — when the fix is "drop shadows" or "lower the Large tier", not "rewrite the render layer after six other features exist."

**M1 — Real puzzles, still client-only.** Upload via `FileReader` (no server), EXIF handling, aspect-derived grid, difficulty picker, scatter ring, the three findability aids, HUD + timer, completion panel. A complete, playable game that forgets everything on refresh.

**M2 — Persistence.** Drizzle schema, Postgres, R2 presigned upload, `puzzles`/`games`, save cadence + version conflict + localStorage net.

**M3 — Auth.** Lazy anon creation, Google OAuth, attach-to-existing-row, collision prompt.

**M4 — Share + library.** `visibility`, `/puzzle/:id` for visitors creating their own game, library grid with progress rings, personal bests.

**M5 — Polish.** Mobile gesture tuning, quality toggle, empty/error/loading states, HEIC messaging.

**Why M1 stays client-only:** it keeps the fun loop shippable and testable before any infrastructure exists. If M0's gate fails, days are spent, not weeks. The `core/` boundary means M2 adds a persistence adapter rather than rewriting anything.

**Why auth (M3) comes after persistence (M2):** anonymous play works throughout, which is exactly the Q3 model. Building auth first would tempt an auth-gated design.

---

## 3. Data model

- `players` — id, nullable email / provider_id, created_at.
- `images` — id, player_id, r2_key, thumb_key, width, height, created_at.
- `puzzles` — id, image_id, player_id, rows, cols, seed, visibility, created_at.
- `games` — id, puzzle_id, player_id, state (jsonb), version, elapsed_ms, moves_count, completed_at, updated_at.

Completion records live on `games` rather than a separate table.

---

## 4. Explicitly deferred

| Item | Revisit when |
|---|---|
| Undo | Probably never — no destructive action to undo |
| Replay / solve timelapse | Post-v1; append-only move log alongside the snapshot |
| Piece rotation | Post-v1; `rotation` field already reserved |
| XL difficulty tier (>300) | Needs higher source resolution + shadows-off toggle together |
| Public gallery | Requires a real moderation pipeline — likely never |
| Leaderboards | Only as aggregate stats; never as a ranked board |
| Sorting tray, colour filters, hints | If 300-piece findability proves insufficient in practice |
| Crop UI, filters, background removal | On demand |
| Email/password and magic-link auth | If Google-only proves limiting |
| Multiplayer / co-op | Would justify splitting out a real backend |
