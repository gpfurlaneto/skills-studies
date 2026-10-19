---
name: config-package-shared
description: Reconstrói o pacote compartilhado base da aplicação, concentrando contratos reutilizáveis, classes base, erros de domínio, casos de uso e validações consumidas pelo backend, frontend e módulos de negócio.
---

# config-package-shared

Rebuilds `packages/shared` in a Turborepo + npm workspaces monorepo by running one deterministic script. The package is **not** generated at runtime: the skill carries a faithful copy of it in `assets/shared/` and only materializes that copy in the right place, then adapts the namespace to the current monorepo. Do not recreate or edit the files by hand — every run must produce the same package.

## Contents of this skill

Everything the rebuild needs lives inside this folder; copying `.claude/skills/config-package-shared` copies the whole skill.

```
config-package-shared/
├── SKILL.md
├── agents/openai.yaml
├── scripts/rebuild-shared.mjs   # the only entrypoint
└── assets/shared/               # verbatim snapshot of packages/shared (name: @temp/shared)
    ├── package.json
    ├── tsconfig.json
    ├── jest.config.ts
    ├── src/{db,error,model,usecase,validation}/**, src/index.ts
    └── test/**
```

The snapshot contains no project namespace: its `package.json` is named `@temp/shared`, and nothing in `src/` or `test/` imports a scoped package. Generated artifacts (`dist`, `coverage`, `.turbo`, `node_modules`, `*.tsbuildinfo`) are never part of it.

## How to run

1. Run from the monorepo root (the folder with the root `package.json`, `apps/`, `packages/`):

```bash
node .claude/skills/config-package-shared/scripts/rebuild-shared.mjs
```

Options:
- `--force` — delete an existing `packages/shared` and rebuild it. **Ask the user before using it**: it removes the current package, including uncommitted changes.
- `--scope <@scope>` — skip detection and use this scope. Use only when the user gives it or detection reports ambiguity.
- `--cwd <dir>` — run against another monorepo root.

The run executes `npm i`, a Turbo build and the package tests — use a long timeout (10 min).

2. Report the result: package name, number of files created per area (`db`, `error`, `model`, `usecase`, `validation`, `test`), the `package.json` files updated, and that install, build and tests passed. If the script fails, show the failing step and its error; fix the cause and run again (with `--force` if `packages/shared` was already created, after confirming with the user).

## What the script does (in order)

| # | Step |
|---|------|
| 1 | Preflight: root `package.json` exists and its `workspaces` include `packages/*`; the file referenced by `extends` in the snapshot `tsconfig.json` (`packages/typescript-config/base.json`) exists; the snapshot is complete and named `@temp/shared`; `packages/shared` does not exist (unless `--force`). Nothing changes if a check fails |
| 2 | Copy `assets/shared/` verbatim into `packages/shared/` — the package now exists as `@temp/shared` |
| 3 | Detect the scope (only after the package exists): `--scope` if given → scope of the root `package.json` name if it is scoped → most frequent scope among `apps/*`, `modules/*`, `packages/*` names (excluding `packages/shared` and `@temp`; a tie aborts and asks for `--scope`) → `@<root name>` as last resort |
| 4 | Rename `packages/shared/package.json` from `@temp/shared` to `@<scope>/shared` |
| 5 | In every `apps/*/package.json` and `modules/*/package.json` (all of them consume the shared base): remove stale shared entries (`@temp/shared`, other scopes, `file:`/link values) and set `"@<scope>/shared": "*"` — kept in the field/position where it already was, otherwise added to `dependencies` in alphabetical order. Files already correct are left untouched |
| 6 | `npm i` at the root, then check `node_modules/@<scope>/shared` resolves to `packages/shared` |
| 7 | `npx turbo run build --filter=@<scope>/shared --force` (cache bypassed so `dist/` is really produced), check `dist/index.js` and `dist/index.d.ts`, then `npm test -w @<scope>/shared` |
| 8 | Summary |

## Updating the snapshot

When the canonical `packages/shared` changes, refresh `assets/shared/` from it (excluding generated artifacts) and put the neutral name back:

```bash
rsync -a --delete --exclude node_modules --exclude dist --exclude coverage --exclude .turbo --exclude .DS_Store --exclude '*.tsbuildinfo' \
  packages/shared/ .claude/skills/config-package-shared/assets/shared/
# then set "name" in assets/shared/package.json back to "@temp/shared"
```
