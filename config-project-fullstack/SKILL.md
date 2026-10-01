---
name: config-project-fullstack
description: Scaffolds a brand-new fullstack monorepo from absolute zero — Turborepo (npm) with a Next.js frontend on port 3000 and a NestJS backend on port 4000 that loads environment variables through @nestjs/config, CORS enabled, .env/.env.example files for both apps — and optionally renames every workspace package to a given npm namespace (e.g. @acme). Use this skill whenever the user asks to create, bootstrap, scaffold, set up or "configure from scratch" a fullstack / monorepo / Turborepo project with Next.js + NestJS (frontend + backend), mentions "config-project-fullstack", or wants the standard project setup with an @namespace for its packages.
---

# config-project-fullstack

Creates a Turborepo monorepo **directly in the directory where it is executed** (no new project folder is created) with `apps/frontend` (Next.js) and `apps/backend` (NestJS) by running one deterministic script. The script performs every setup step itself, checks each result, and finally verifies that the running project actually works. Do not replicate the steps by hand — the point of the script is that every run produces the same result and fails loudly instead of leaving a half-configured project.

## How to run

1. Extract from the user's request:
   - **Project name** (optional) — only used as the root `package.json` name. Default: the current directory's name, lowercased. Must be lowercase (`a-z 0-9 . _ -`).
   - **Namespace** (optional), e.g. `@acme`. If the user gives `acme`, the script prefixes `@`.
2. Run from the current project root — the monorepo files (`package.json`, `turbo.json`, `apps/`, `packages/`...) are written right there:

```bash
node .claude/skills/config-project-fullstack/scripts/setup.mjs [--name <project-name>] [--namespace @scope]
```

Options:
- `--cwd <dir>` — scaffold into another existing directory instead of the current one (still in place, no subfolder).
- `--skip-verify` — skip the server start-up checks (only if the user asks; verification is what guarantees the result).

The run downloads packages and starts dev servers, so it takes several minutes — use a long timeout (10 min) or run it in the background and wait for it.

3. Report the result: the project path, the final package names printed in the summary, and how to start it (`npm run dev` in the same directory). If the script fails, show the failing step and its error message; don't try to "patch" a partially created project — fix the cause (e.g. free a port) and, with the user's permission, remove the generated files (`package.json`, `package-lock.json`, `turbo.json`, `apps/`, `packages/`, `node_modules/`) and run again. Never delete other files of the user's directory.

## What the script does (in order)

| # | Step |
|---|------|
| 1 | Preflight: validate name/namespace, Node ≥ 20, npm/npx present, the current directory must **not** already contain `package.json`, `package-lock.json`, `turbo.json`, `apps/`, `packages/` or `node_modules/`, ports 3000/4000/4123 free |
| 2 | `npx create-turbo@latest <name> -m npm --skip-install --no-git` in a temporary `.config-project-fullstack-tmp/` folder (create-turbo refuses non-empty folders), then move the output into the current directory and delete the temporary folder. Files that already exist (e.g. `README.md`, `.npmrc`) are kept; an existing `.gitignore` gets the missing entries appended |
| 3 | `rm -rf apps/*` (guarded so it can only delete inside the new project) |
| 4 | `npx create-next-app@latest frontend --yes --src-dir --disable-git` (in `apps/`) |
| 5 | `npm i -g @nestjs/cli` (falls back to `npx @nestjs/cli` if a global install isn't permitted) |
| 6 | `nest new backend -g -p npm` (in `apps/`) |
| 7 | `npm install @nestjs/config` (in `apps/backend`) |
| 8 | Overwrite `apps/backend/src/app.module.ts` with `ConfigModule.forRoot({ isGlobal: true })` |
| 9 | Overwrite `apps/backend/src/main.ts`: `app.enableCors()` and `listen(process.env.PORT ?? 4000)` |
| 10 | Add `"dev": "nest start --watch"` to `apps/backend/package.json` |
| 11 | Create `apps/frontend/.env.example` (`NEXT_PUBLIC_API_URL=http://localhost:4000`) and `apps/backend/.env.example` (`PORT=4000`), each copied to `.env` |
| 12 | `npm install` at the root to link all workspaces |
| 13 | Build the backend |
| 14 | Env check: temporarily sets `PORT=4123` in `apps/backend/.env`, starts the backend and confirms it listens on 4123 (proves `.env` is loaded), then restores `.env` |
| 15 | If `--namespace` was given: rename every package in `apps/*` and `packages/*` to `<namespace>/<name>` (e.g. `frontend` → `@acme/frontend`, `@repo/ui` → `@acme/ui`), updating dependency references and scoped imports/`extends` in source/config files |
| 16 | `npm install` again so workspace links match the new names |
| 17 | Run `npm run dev` at the root and confirm the backend answers on 4000 (`Hello World!`, with CORS headers) and the frontend on 3000, then stop the servers |

The namespace rename runs only after the whole scaffold has been built and verified, so it can never interfere with the setup steps, and the final check (step 17) runs after the rename to prove the renamed project still works.

## Notes

- The script removes `PORT` from the environment of every child process, because an inherited `PORT` would override `apps/backend/.env` and move Next.js off port 3000.
- No git repository is created (not at the root, not in `apps/frontend`): the directory belongs to the user, who decides about git.
- Other content of the directory (`.claude/`, docs, etc.) is left untouched.
- Commands run with stdin closed: if any CLI unexpectedly asks a question, the run fails instead of hanging.
- `@latest` generators are used as specified by the original setup, so the exact versions of Next.js/NestJS/Turborepo depend on the day the skill runs; the structure and configuration are always the same.
