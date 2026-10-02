#!/usr/bin/env node
// Deterministic generator for a new business module inside an existing
// Turborepo monorepo (created by config-project-fullstack).
//
// The module is created at modules/<name> from the files in
// ../assets/module-template, with these placeholders replaced:
//   __PACKAGE_NAME__ -> <namespace>/<name>   (e.g. @acme/auth)
//   __MODULE_NAME__  -> <name>               (e.g. auth)
//
// Usage:
//   node create-module.mjs --name <module-name> --namespace <@scope> [--cwd <dir>]
//
// Every step either succeeds or aborts the whole run with a non-zero exit code.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants (the "spec" of the generated module)
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(SCRIPT_DIR, '..', 'assets', 'module-template');
const CONSUMER_APPS = ['apps/frontend', 'apps/backend'];
const REQUIRED_WORKSPACES = ['apps/*', 'modules/*', 'packages/*'];
const TS_NODE_VERSION = '^10.9.2';
const IGNORED_TEMPLATE_ENTRIES = new Set(['.DS_Store', 'node_modules', 'dist', 'coverage']);

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
function fail(msg) {
  console.error(`\n\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for --${key}`);
    args[key] = value;
    i += 1;
  }
  for (const key of Object.keys(args)) {
    if (!['name', 'namespace', 'cwd'].includes(key)) fail(`Unknown option: --${key}`);
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
  const res = spawnSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' });
  if (res.error) fail(`${cmd} failed to start: ${res.error.message}`);
  if (res.status !== 0) fail(`"${cmd} ${args.join(' ')}" exited with code ${res.status}`);
}

function copyTemplate(srcDir, destDir, replacements) {
  fs.mkdirSync(destDir, { recursive: true });
  const created = [];
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (IGNORED_TEMPLATE_ENTRIES.has(entry.name)) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      created.push(...copyTemplate(src, dest, replacements));
    } else {
      let content = fs.readFileSync(src, 'utf8');
      for (const [placeholder, value] of replacements) content = content.split(placeholder).join(value);
      fs.writeFileSync(dest, content);
      created.push(dest);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.cwd ?? process.cwd());

step('Preflight');
if (!args.namespace) fail('--namespace is required (e.g. --namespace @acme). Nothing was changed.');
const namespace = args.namespace.startsWith('@') ? args.namespace : `@${args.namespace}`;
if (!/^@[a-z0-9][a-z0-9._-]*$/.test(namespace)) fail(`Invalid namespace "${namespace}": use lowercase a-z 0-9 . _ -`);
if (!args.name) fail('--name is required (e.g. --name auth). Nothing was changed.');
const moduleName = args.name;
if (!/^[a-z0-9][a-z0-9._-]*$/.test(moduleName)) fail(`Invalid module name "${moduleName}": use lowercase a-z 0-9 . _ -`);
const packageName = `${namespace}/${moduleName}`;

if (!fs.existsSync(TEMPLATE_DIR)) fail(`Template not found: ${TEMPLATE_DIR}`);
const rootPkgFile = path.join(root, 'package.json');
if (!fs.existsSync(rootPkgFile)) fail(`No package.json in ${root}: run this at the monorepo root.`);
const appPkgFiles = CONSUMER_APPS.map((app) => path.join(root, app, 'package.json'));
for (const file of appPkgFiles) {
  if (!fs.existsSync(file)) fail(`Missing ${path.relative(root, file)}: the monorepo must have apps/frontend and apps/backend.`);
}
const moduleDir = path.join(root, 'modules', moduleName);
if (fs.existsSync(moduleDir)) fail(`modules/${moduleName} already exists. Nothing was changed.`);
if (!fs.existsSync(path.join(root, 'packages', 'typescript-config', 'base.json'))) {
  fail('packages/typescript-config/base.json not found: the module tsconfig extends it.');
}
ok(`root: ${root}`);
ok(`module: modules/${moduleName} (package ${packageName})`);

step(`Create modules/${moduleName} from the template`);
fs.mkdirSync(path.join(root, 'modules'), { recursive: true });
const created = copyTemplate(TEMPLATE_DIR, moduleDir, [
  ['__PACKAGE_NAME__', packageName],
  ['__MODULE_NAME__', moduleName],
]);
for (const file of created) ok(path.relative(root, file));

step(`Add "${packageName}": "*" to the frontend and backend dependencies`);
for (const file of appPkgFiles) {
  const pkg = readJson(file);
  pkg.dependencies = { ...(pkg.dependencies ?? {}), [packageName]: '*' };
  writeJson(file, pkg);
  ok(path.relative(root, file));
}

step(`Ensure ts-node ${TS_NODE_VERSION} and the workspaces in the root package.json`);
const rootPkg = readJson(rootPkgFile);
rootPkg.devDependencies = rootPkg.devDependencies ?? {};
if (rootPkg.devDependencies['ts-node']) {
  ok(`ts-node already present (${rootPkg.devDependencies['ts-node']})`);
} else {
  rootPkg.devDependencies['ts-node'] = TS_NODE_VERSION;
  ok(`added ts-node ${TS_NODE_VERSION}`);
}
if (rootPkg.workspaces !== undefined && !Array.isArray(rootPkg.workspaces)) {
  fail('Root "workspaces" is not an array; update it manually.');
}
// Required entries first, in their canonical order, then any extra entries the project already had.
const workspaces = [...REQUIRED_WORKSPACES, ...(rootPkg.workspaces ?? []).filter((ws) => !REQUIRED_WORKSPACES.includes(ws))];
rootPkg.workspaces = workspaces;
writeJson(rootPkgFile, rootPkg);
ok(`workspaces: ${JSON.stringify(workspaces)}`);

step('Install dependencies (npm install)');
run('npm', ['install'], root);
if (!fs.existsSync(path.join(root, 'node_modules', ...packageName.split('/')))) {
  fail(`node_modules/${packageName} was not linked after npm install.`);
}
ok(`${packageName} linked in node_modules`);

step('Build the project (npm run build)');
run('npm', ['run', 'build'], root);
if (!fs.existsSync(path.join(moduleDir, 'dist', 'index.js'))) fail(`modules/${moduleName}/dist/index.js was not generated.`);
ok(`modules/${moduleName}/dist generated`);

step(`Run the module tests (npm test -w ${packageName})`);
run('npm', ['test', '-w', packageName], root);
ok('tests passed');

step('Summary');
ok(`Module ${packageName} created at modules/${moduleName}`);
ok(`Dependency added to ${CONSUMER_APPS.join(' and ')}`);
ok('Install, build and tests succeeded');
