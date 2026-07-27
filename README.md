# Jigsaw

Upload an image, get a jigsaw puzzle you assemble by dragging pieces in a three.js
scene. Next.js 15 App Router + React Three Fiber.

Design doc: [`plans/puzzle-game-plan.md`](plans/puzzle-game-plan.md).
Architecture invariants: [`CLAUDE.md`](CLAUDE.md).

## Local development

```bash
npm install
npm run dev       # http://localhost:3000
```

Other scripts:

```bash
npm run build     # production build
npm run typecheck # tsc --noEmit
npm test          # vitest
```

## Deploying to Vercel

The app is a zero-config Next.js deploy — no `vercel.json`, no build overrides, and
**no environment variables** are needed at the current milestone (M1 runs entirely
in the browser: no database, blob storage, or auth yet).

### Option A — Git integration (recommended)

1. Go to [vercel.com/new](https://vercel.com/new) and import
   `MiranNadav/personal-puzzle-game`.
2. Leave every setting at its default. Vercel detects Next.js and uses
   `npm ci` + `next build` on Node 22.
3. Deploy.

Vercel then builds every push automatically: the production branch gets a
production deploy, and every other branch/PR gets a preview URL.

### Option B — CLI

```bash
npm i -g vercel
vercel login
vercel          # preview deploy
vercel --prod   # production deploy
```

### Environment variables (future milestones)

M2+ introduces Postgres, Cloudflare R2, and Auth.js. When those land, add their
secrets under **Project → Settings → Environment Variables** in Vercel. Nothing is
required before then.

### Deployment notes

- `package-lock.json` must stay in sync with `package.json`. Vercel runs `npm ci`,
  which fails hard on drift — run `npm install` and commit the lockfile after any
  dependency change.
- The WebGL scene is `dynamic(..., { ssr: false })`, so it is never server-rendered;
  the build prerenders only the shell.
- Image processing (`sharp`, arriving in M2) must run on the Node runtime. Never set
  `export const runtime = "edge"` on a route that touches it.
