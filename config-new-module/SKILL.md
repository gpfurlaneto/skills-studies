---
name: config-new-module
description: Creates a new business module inside the `modules/` folder of an existing Turborepo monorepo (the one produced by config-project-fullstack) from a fixed template — package.json, tsconfig.json, jest.config.ts, src/index.ts and test/index.test.ts — publishes it as `<namespace>/<module-name>`, adds it as a dependency of apps/frontend and apps/backend, makes sure the root package.json has ts-node and the `modules/*` workspace, creates the matching NestJS module at apps/backend/src/modules/<module-name> (registered in AppModule, with a controller exposing GET /<module-name> that returns a default message), then installs, builds, runs the module tests and checks the endpoint. Use this skill whenever the user asks to create, add, scaffold or configure a new module / business module / domain module (e.g. "create the auth module"), or mentions "config-new-module". Requires a namespace (e.g. @acme).
---

# config-new-module

Creates `modules/<module-name>` in the monorepo by running one deterministic script. The script copies the template in `assets/module-template` literally (only replacing the placeholders), wires the module into the monorepo, creates the matching NestJS module in the backend, and verifies the result by installing, building, testing and calling the new endpoint. Do not replicate the steps by hand — every run must produce the same files.

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

The run executes `npm install`, `npm run build`, the module tests and briefly starts the built backend on a random free port, so it can take a few minutes — use a long timeout (10 min).

3. Report the result: the module path, the package name, the files created (including the NestJS module and controller in `apps/backend/src/modules/<module-name>`), the endpoint (`GET /<module-name>`), and that install, build, tests and the endpoint check passed. If the script fails, show the failing step and its error message. Don't patch a half-created module by hand: fix the cause and, with the user's permission, remove `modules/<module-name>`, `apps/backend/src/modules/<module-name>`, the module's import/registration in `apps/backend/src/app.module.ts` and the `"<namespace>/<module-name>"` entries added to `apps/frontend/package.json` and `apps/backend/package.json`, then run again.

## What the script does (in order)

| # | Step |
|---|------|
| 1 | Preflight: `--namespace` and `--name` present and valid; root `package.json`, `apps/frontend/package.json`, `apps/backend/package.json`, `apps/backend/nest-cli.json`, `apps/backend/src/app.module.ts` and `packages/typescript-config/base.json` exist; `modules/<module-name>` and `apps/backend/src/modules/<module-name>` do **not** exist yet. Nothing is changed if any check fails |
| 2 | Create `modules/` if missing, then `modules/<module-name>/` with the template files, replacing `__PACKAGE_NAME__` → `<namespace>/<module-name>` and `__MODULE_NAME__` → `<module-name>` |
| 3 | Add `"<namespace>/<module-name>": "*"` to `dependencies` in `apps/frontend/package.json` and `apps/backend/package.json` |
| 4 | Root `package.json`: add `"ts-node": "^10.9.2"` to `devDependencies` if ts-node isn't there (needed by Jest to read `jest.config.ts`); make sure `workspaces` starts with `apps/*`, `modules/*`, `packages/*` (in this order; any other existing entries are kept after them) |
| 5 | `npm install` at the root, then check the module is linked in `node_modules` |
| 6 | NestJS module, using the Nest CLI at the same version the backend has installed (`npx @nestjs/cli@<version>`, run in a temporary copy of the backend config + `app.module.ts` outside the monorepo, because npm hoisting can give `@nestjs/schematics` an incompatible root `typescript`; the results are copied back): `nest g module modules/<module-name>` (creates `apps/backend/src/modules/<module-name>/<module-name>.module.ts` and registers it in the `imports` of `AppModule`) and `nest g controller modules/<module-name> --no-spec` (declares it in the new module). Checks the registration, then overwrites the controller with `assets/backend-module-template/controller.ts`, keeping the class name and route the CLI chose |
| 7 | `npm run build` at the root, then check `modules/<module-name>/dist/index.js` and `apps/backend/dist/modules/<module-name>/<module-name>.controller.js` exist |
| 8 | `npm test -w <namespace>/<module-name>` (Jest with coverage) |
| 9 | Start `apps/backend/dist/main.js` on a random free port and check `GET /<module-name>` returns `Hello from the <module-name> module!`, then stop it |
| 10 | Summary |

## Template files (`assets/module-template`)

| File | Content |
|------|---------|
| `package.json` | name `__PACKAGE_NAME__`, `main`/`types`/`exports` pointing to `dist/`, scripts `dev`, `build` (tsc), `test` (jest --coverage), `test:watch`; devDependencies jest, ts-jest, @types/jest, typescript |
| `tsconfig.json` | extends `../../packages/typescript-config/base.json`, `rootDir: src`, `outDir: ./dist`, declarations on |
| `jest.config.ts` | `ts-jest` preset, tests in `test/**/*.test.ts` |
| `src/index.ts` | `getModuleName()` returning `__MODULE_NAME__` |
| `test/index.test.ts` | asserts `getModuleName()` returns the module name |

To change what every new module looks like, edit these files — the script copies whatever is in the folder (except `.DS_Store`, `node_modules`, `dist` and `coverage`).

## Backend template (`assets/backend-module-template`)

| File | Content |
|------|---------|
| `controller.ts` | `@Controller('__ROUTE__')` class `__CONTROLLER_CLASS__` with `@Get() getMessage()` returning `__MESSAGE__` |

The placeholders are filled from the files generated by the Nest CLI (`__ROUTE__`, `__CONTROLLER_CLASS__`, e.g. `auth` and `AuthController`) and the script (`__MESSAGE__` → `Hello from the <module-name> module!`). The module file and the `AppModule` registration come from the Nest CLI as generated. No spec files are created for the backend module.
