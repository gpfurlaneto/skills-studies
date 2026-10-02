---
name: config-new-module
description: Creates a new business module inside the `modules/` folder of an existing Turborepo monorepo (the one produced by config-project-fullstack) from a fixed template — package.json, tsconfig.json, jest.config.ts, src/index.ts and test/index.test.ts — publishes it as `<namespace>/<module-name>`, adds it as a dependency of apps/frontend and apps/backend, makes sure the root package.json has ts-node and the `modules/*` workspace, then installs, builds and runs the module tests. Use this skill whenever the user asks to create, add, scaffold or configure a new module / business module / domain module (e.g. "create the auth module"), or mentions "config-new-module". Requires a namespace (e.g. @acme).
---

# config-new-module

Creates `modules/<module-name>` in the monorepo by running one deterministic script. The script copies the template in `assets/module-template` literally (only replacing the placeholders), wires the module into the monorepo, and verifies the result by installing, building and testing. Do not replicate the steps by hand — every run must produce the same files.

## How to run

1. Extract from the user's request:
   - **Module name** (required), e.g. `auth`. Lowercase (`a-z 0-9 . _ -`).
   - **Namespace** (required), e.g. `@acme`. If the user gives `acme`, the script prefixes `@`.

   **If the namespace was not given, do not run the skill.** Ask the user for it and stop. Do not guess it, and do not infer it from existing package names. If the module name is missing, ask for it as well.

2. Run from the monorepo root (the folder with the root `package.json`, `apps/` and `packages/`):

```bash
node .claude/skills/config-new-module/scripts/create-module.mjs --name <module-name> --namespace <@scope>
```

Options:
- `--cwd <dir>` — run against another monorepo root instead of the current directory.

The run executes `npm install`, `npm run build` and the module tests, so it can take a few minutes — use a long timeout (10 min).

3. Report the result: the module path, the package name, the files created, and that install, build and tests passed. If the script fails, show the failing step and its error message. Don't patch a half-created module by hand: fix the cause and, with the user's permission, remove `modules/<module-name>` and the `"<namespace>/<module-name>"` entries added to `apps/frontend/package.json` and `apps/backend/package.json`, then run again.

## What the script does (in order)

| # | Step |
|---|------|
| 1 | Preflight: `--namespace` and `--name` present and valid; root `package.json`, `apps/frontend/package.json`, `apps/backend/package.json` and `packages/typescript-config/base.json` exist; `modules/<module-name>` does **not** exist yet. Nothing is changed if any check fails |
| 2 | Create `modules/` if missing, then `modules/<module-name>/` with the template files, replacing `__PACKAGE_NAME__` → `<namespace>/<module-name>` and `__MODULE_NAME__` → `<module-name>` |
| 3 | Add `"<namespace>/<module-name>": "*"` to `dependencies` in `apps/frontend/package.json` and `apps/backend/package.json` |
| 4 | Root `package.json`: add `"ts-node": "^10.9.2"` to `devDependencies` if ts-node isn't there (needed by Jest to read `jest.config.ts`); make sure `workspaces` starts with `apps/*`, `modules/*`, `packages/*` (in this order; any other existing entries are kept after them) |
| 5 | `npm install` at the root, then check the module is linked in `node_modules` |
| 6 | `npm run build` at the root, then check `modules/<module-name>/dist/index.js` exists |
| 7 | `npm test -w <namespace>/<module-name>` (Jest with coverage) |
| 8 | Summary |

## Template files (`assets/module-template`)

| File | Content |
|------|---------|
| `package.json` | name `__PACKAGE_NAME__`, `main`/`types`/`exports` pointing to `dist/`, scripts `dev`, `build` (tsc), `test` (jest --coverage), `test:watch`; devDependencies jest, ts-jest, @types/jest, typescript |
| `tsconfig.json` | extends `../../packages/typescript-config/base.json`, `rootDir: src`, `outDir: ./dist`, declarations on |
| `jest.config.ts` | `ts-jest` preset, tests in `test/**/*.test.ts` |
| `src/index.ts` | `getModuleName()` returning `__MODULE_NAME__` |
| `test/index.test.ts` | asserts `getModuleName()` returns the module name |

To change what every new module looks like, edit these files — the script copies whatever is in the folder (except `.DS_Store`, `node_modules`, `dist` and `coverage`).
