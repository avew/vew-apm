# Contributing to Vew APM

`main` is protected: **no direct pushes**. Every change lands through a pull
request that passes CI. This doc is the short version of that flow.

## 1. Local setup

```bash
npm install
npm run db:push        # create/upgrade the SQLite schema (data/apm.db)
npm run dev            # app + in-process scheduler on http://localhost:3000
npm run mock           # optional: fake actuator on :4100 to point a monitor at
```

## 2. Branch → change → PR

`main` rejects direct pushes, so always work on a branch:

```bash
git checkout -b <type>/<short-desc>     # e.g. feat/telegram-retry
# ...edit...
git commit -am "feat: ..."
git push origin <type>/<short-desc>
```

Then open a PR into `main` on GitHub. When both checks go green the **Merge**
button unlocks. Delete the branch after merge.

## 3. Run the checks locally first

CI runs exactly these — run them before you push so the PR is green on the first
try:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Fastest inner loop while coding: `npx vitest` (watch mode) for the pure modules
(`lib/parser.ts`, `lib/rules.ts`, `lib/rate-limit.ts`).

## 4. What CI enforces

Two workflows run on every push and PR (see [.github/workflows/](.github/workflows/)):

| Check | Workflow | Does |
|---|---|---|
| **Lint · Typecheck · Test · Build** | `ci.yml` | `npm ci` → lint → typecheck → test → `next build` (Node 22) |
| **Docker build** | `docker.yml` | builds the image; on merge to `main`, pushes it to `ghcr.io/avew/vew-apm` |

Both must pass before a PR can merge (enforced by the `protect main` ruleset —
see [.github/rulesets/protect-main.json](.github/rulesets/protect-main.json)).

## 5. Commit messages

Conventional-commit prefixes, matching the existing history:

```
feat:  new user-facing capability
fix:   bug fix
perf:  performance
ci:    CI / build / tooling
docs:  documentation only
refactor: no behavior change
```

## 6. Gotchas that will bite you

- **Dev scheduler is bound at boot** (`instrumentation.ts` → `setInterval`); HMR
  does **not** reload it. After editing `checker.ts` / `rules.ts` / `parser.ts`,
  **restart `npm run dev`** or checks keep running the old code.
- **Schema changes need a migration.** After editing `lib/db/schema.ts`, run
  `npm run db:generate` and commit the new file in `drizzle/` — the Docker
  migrator ([scripts/migrate.cjs](scripts/migrate.cjs)) applies it on the next
  container start. Locally, `npm run db:push` updates your dev DB directly.
- **Never commit `data/` or `.env`** — both are gitignored (they hold the
  password hash and channel secrets).
- Keep `lib/rules.ts` and `lib/parser.ts` **pure** (no DB access) — the checker
  feeds them DB-derived inputs. That's what keeps them unit-testable.

## 7. Emergency hotfix

The ruleset has no bypass by default, so even an admin goes through a PR. If you
truly need to skip it once, add yourself to the ruleset's **Bypass list**
(Settings → Rules → Rulesets → protect main), push the fix, then remove yourself.
