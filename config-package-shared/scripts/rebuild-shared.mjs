#!/usr/bin/env node
// Deterministic rebuild of packages/shared inside a Turborepo + npm workspaces monorepo.
//
// The package is NOT generated: it is copied verbatim from ../assets/shared, which is a
// faithful snapshot of the canonical shared package. The snapshot ships with a neutral
// placeholder name (TEMP_PACKAGE_NAME) so the skill carries no project namespace.
//
// Flow:
//   1. Preflight
//   2. Materialize ../assets/shared -> packages/shared (named @temp/shared)
//   3. Detect the workspace scope from the monorepo package.json files (or --scope)
//   4. Rename packages/shared to @<scope>/shared
//   5. Add/normalize "@<scope>/shared": "*" in apps/* and modules/* package.json files
//   6. npm install at the root and check the workspace link
//   7. npx turbo run build --filter=@<scope>/shared, then the package tests
//   8. Summary
//
// Usage:
//   node rebuild-shared.mjs [--cwd <dir>] [--scope <@scope>] [--force]
//
//   --cwd    monorepo root (default: current directory)
//   --scope  skip detection and use this scope (e.g. @acme)
//   --force  delete an existing packages/shared before materializing it
//
// Every step either succeeds or aborts the whole run with a non-zero exit code.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.resolve(SCRIPT_DIR, '..', 'assets', 'shared');
const TEMP_PACKAGE_NAME = '@temp/shared';
const PACKAGE_DIR = 'packages/shared';
const PACKAGE_BASENAME = 'shared';
const SCOPE_SOURCES = ['apps', 'modules', 'packages'];
const CONSUMER_DIRS = ['apps', 'modules'];
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];
const IGNORED_ENTRIES = new Set(['.DS_Store', 'node_modules', 'dist', 'coverage', '.turbo']);
const REQUIRED_FILES = ['package.json', 'tsconfig.json', 'jest.config.ts', 'src/index.ts'];
const SCOPE_RE = /^@[a-z0-9][a-z0-9._-]*$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 8;
let stepNo = 0;
function step(msg) {
  stepNo += 1;
  console.log(`\n\x1b[36m[${stepNo}/${TOTAL_STEPS}] ${msg}\x1b[0m`);
}
function ok(msg) {
  console.log(`\x1b[32m  ✔ ${msg}\x1b[0m`);
}
function info(msg) {
  console.log(`  • ${msg}`);
}
function fail(msg) {
  console.error(`\n\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (!arg.startsWith('--')) fail(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for --${key}`);
    if (!['cwd', 'scope'].includes(key)) fail(`Unknown option: --${key}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`Could not read ${file}: ${err.message}`);
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function run(cmd, args, cwd) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) fail(`Command failed (exit ${res.status}): ${cmd} ${args.join(' ')}`);
}

function copyTree(src, dest, created, root) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED_ENTRIES.has(entry.name) || entry.name.endsWith('.tsbuildinfo')) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to, created, root);
    else {
      fs.copyFileSync(from, to);
      created.push(path.relative(root, to));
    }
  }
}

function workspacePackageJsons(root, dirs) {
  const files = [];
  for (const dir of dirs) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const pkg = path.join(base, entry.name, 'package.json');
      if (entry.isDirectory() && fs.existsSync(pkg)) files.push(pkg);
    }
  }
  return files;
}

const scopeOf = (name) => (typeof name === 'string' && name.startsWith('@') && name.includes('/') ? name.split('/')[0] : null);
const isSharedDep = (name) => name === TEMP_PACKAGE_NAME || /^@[^/]+\/shared$/.test(name);

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function preflight(root, args) {
  step('Preflight');
  const rootPkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(rootPkgFile)) fail(`No package.json at ${root}. Run from the monorepo root or pass --cwd.`);
  const rootPkg = readJson(rootPkgFile);
  const workspaces = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : rootPkg.workspaces?.packages ?? [];
  if (!workspaces.includes('packages/*')) fail('Root package.json "workspaces" must include "packages/*".');
  ok('root package.json declares the "packages/*" workspace');

  const sharedTsconfig = readJson(path.join(SNAPSHOT_DIR, 'tsconfig.json'));
  if (sharedTsconfig.extends) {
    const base = path.resolve(root, PACKAGE_DIR, sharedTsconfig.extends);
    if (!fs.existsSync(base)) fail(`${path.relative(root, base)} is required by ${PACKAGE_DIR}/tsconfig.json but does not exist.`);
    ok(`${path.relative(root, base)} exists`);
  }

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(SNAPSHOT_DIR, file))) fail(`Skill snapshot is incomplete: assets/shared/${file} is missing.`);
  }
  const snapshotName = readJson(path.join(SNAPSHOT_DIR, 'package.json')).name;
  if (snapshotName !== TEMP_PACKAGE_NAME) fail(`assets/shared/package.json must be named ${TEMP_PACKAGE_NAME} (found ${snapshotName}).`);
  ok('skill snapshot is complete and neutral');

  if (args.scope !== undefined && !SCOPE_RE.test(args.scope)) fail(`Invalid --scope "${args.scope}". Expected something like @acme.`);

  const target = path.join(root, PACKAGE_DIR);
  if (fs.existsSync(target) && !args.force) {
    fail(`${PACKAGE_DIR} already exists. Re-run with --force to delete and rebuild it.`);
  }
  ok(fs.existsSync(target) ? `${PACKAGE_DIR} exists and will be replaced (--force)` : `${PACKAGE_DIR} does not exist yet`);
}

function materialize(root, force) {
  step(`Materialize ${PACKAGE_DIR} as ${TEMP_PACKAGE_NAME}`);
  const target = path.join(root, PACKAGE_DIR);
  if (fs.existsSync(target) && force) {
    fs.rmSync(target, { recursive: true, force: true });
    info(`removed existing ${PACKAGE_DIR}`);
  }
  const created = [];
  copyTree(SNAPSHOT_DIR, target, created, root);
  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(target, file))) fail(`${PACKAGE_DIR}/${file} was not created.`);
  }
  ok(`${created.length} files copied from the skill snapshot`);
  return created;
}

function detectScope(root, override) {
  step('Detect the workspace scope');
  if (override) {
    ok(`using --scope ${override}`);
    return override;
  }

  const rootName = readJson(path.join(root, 'package.json')).name;
  const rootScope = scopeOf(rootName);
  if (rootScope && SCOPE_RE.test(rootScope)) {
    ok(`scope taken from the root package.json name (${rootName}): ${rootScope}`);
    return rootScope;
  }

  const counts = new Map();
  for (const file of workspacePackageJsons(root, SCOPE_SOURCES)) {
    if (path.resolve(path.dirname(file)) === path.resolve(root, PACKAGE_DIR)) continue;
    const name = readJson(file).name;
    const scope = scopeOf(name);
    info(`${path.relative(root, file)} -> ${name ?? '(no name)'}`);
    if (scope && scope !== scopeOf(TEMP_PACKAGE_NAME) && SCOPE_RE.test(scope)) counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }

  if (counts.size > 0) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      fail(`Ambiguous workspace scope (${ranked.map(([s, n]) => `${s}×${n}`).join(', ')}). Re-run with --scope <@scope>.`);
    }
    ok(`scope detected from workspace packages: ${ranked[0][0]} (${ranked[0][1]} package(s))`);
    return ranked[0][0];
  }

  const fallback = typeof rootName === 'string' ? `@${rootName.toLowerCase()}` : null;
  if (fallback && SCOPE_RE.test(fallback)) {
    ok(`no scoped workspace packages found; using the root package name: ${fallback}`);
    return fallback;
  }
  fail('Could not detect the workspace scope. Re-run with --scope <@scope>.');
}

function renamePackage(root, packageName) {
  step(`Rename ${PACKAGE_DIR} to ${packageName}`);
  const file = path.join(root, PACKAGE_DIR, 'package.json');
  const pkg = readJson(file);
  pkg.name = packageName;
  writeJson(file, pkg);
  if (readJson(file).name !== packageName) fail(`Could not rename ${PACKAGE_DIR}/package.json.`);
  ok(`${PACKAGE_DIR}/package.json name: ${TEMP_PACKAGE_NAME} -> ${packageName}`);
}

function wireConsumers(root, packageName) {
  step(`Add/normalize "${packageName}": "*" in ${CONSUMER_DIRS.map((d) => `${d}/*`).join(' and ')}`);
  const updated = [];
  const files = workspacePackageJsons(root, CONSUMER_DIRS);
  if (files.length === 0) info('no consumer packages found');

  for (const file of files) {
    const rel = path.relative(root, file);
    const pkg = readJson(file);
    const before = JSON.stringify(pkg);

    // Keep the field where the shared dependency already lives; default to "dependencies".
    let field = 'dependencies';
    let position = -1;
    for (const f of DEP_FIELDS) {
      const deps = pkg[f];
      if (!deps) continue;
      const keys = Object.keys(deps);
      const idx = keys.findIndex(isSharedDep);
      if (idx !== -1 && position === -1) {
        field = f;
        position = idx;
      }
      // Drop every stale/variant reference (other scopes, @temp, file:/link: values).
      const stale = keys.filter(isSharedDep);
      for (const key of stale) delete deps[key];
      if (stale.length > 0 && Object.keys(deps).length === 0 && f !== field) delete pkg[f];
    }

    const entries = Object.entries(pkg[field] ?? {});
    if (position === -1) {
      entries.push([packageName, '*']);
      entries.sort(([a], [b]) => a.localeCompare(b));
    } else {
      entries.splice(Math.min(position, entries.length), 0, [packageName, '*']);
    }
    pkg[field] = Object.fromEntries(entries);

    if (JSON.stringify(pkg) !== before) {
      writeJson(file, pkg);
      updated.push(rel);
      ok(`${rel}: ${field}["${packageName}"] = "*"`);
    } else {
      info(`${rel}: already up to date`);
    }
  }
  return { files: files.map((f) => path.relative(root, f)), updated };
}

function install(root, packageName) {
  step('npm install at the monorepo root');
  run('npm', ['i'], root);
  const link = path.join(root, 'node_modules', ...packageName.split('/'));
  if (!fs.existsSync(link)) fail(`node_modules/${packageName} was not created.`);
  if (fs.realpathSync(link) !== fs.realpathSync(path.join(root, PACKAGE_DIR))) {
    fail(`node_modules/${packageName} does not point to ${PACKAGE_DIR}.`);
  }
  ok(`node_modules/${packageName} -> ${PACKAGE_DIR}`);
}

function validate(root, packageName) {
  step(`Validate: build and test ${packageName}`);
  // --force skips the turbo cache so dist/ is really produced by this run.
  run('npx', ['turbo', 'run', 'build', `--filter=${packageName}`, '--force'], root);
  for (const file of ['dist/index.js', 'dist/index.d.ts']) {
    if (!fs.existsSync(path.join(root, PACKAGE_DIR, file))) fail(`${PACKAGE_DIR}/${file} was not produced by the build.`);
  }
  ok(`${PACKAGE_DIR}/dist/index.js and index.d.ts built`);
  run('npm', ['test', '-w', packageName], root);
  ok('package tests passed');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.cwd ?? process.cwd());

preflight(root, args);
const created = materialize(root, args.force);
const scope = detectScope(root, args.scope);
const packageName = `${scope}/${PACKAGE_BASENAME}`;
renamePackage(root, packageName);
const consumers = wireConsumers(root, packageName);
install(root, packageName);
validate(root, packageName);

step('Summary');
console.log(`  Package:   ${packageName} (${PACKAGE_DIR})`);
console.log(`  Created:   ${created.length} files`);
for (const dir of ['', 'src/db', 'src/error', 'src/model', 'src/usecase', 'src/validation', 'test']) {
  const prefix = path.join(PACKAGE_DIR, dir);
  const n = created.filter((f) => (dir ? f.startsWith(`${prefix}/`) : path.dirname(f) === PACKAGE_DIR)).length;
  console.log(`             ${(dir || '(root)').padEnd(16)} ${n}`);
}
console.log(`  Consumers: ${consumers.files.length} checked, ${consumers.updated.length} updated`);
for (const f of consumers.updated) console.log(`             ${f}`);
console.log('  Install:   npm i ✔');
console.log(`  Build:     npx turbo run build --filter=${packageName} ✔`);
console.log(`  Tests:     npm test -w ${packageName} ✔`);
