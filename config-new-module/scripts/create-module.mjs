#!/usr/bin/env node
// Deterministic generator for a new business module inside an existing
// Turborepo monorepo (created by config-project-fullstack).
//
// The module is created at modules/<name> from the files in
// ../assets/module-template, with these placeholders replaced:
//   __PACKAGE_NAME__ -> <namespace>/<name>   (e.g. @acme/auth)
//   __MODULE_NAME__  -> <name>               (e.g. auth)
//
// It also creates a NestJS module at apps/backend/src/modules/<name> with the
// project's Nest CLI version (nest g module / nest g controller), which registers
// it in AppModule, and replaces the generated controller with
// ../assets/backend-module-template/controller.ts (GET /<name> -> default message).
//
// Usage:
//   node create-module.mjs --name <module-name> --namespace <@scope> [--cwd <dir>]
//
// Every step either succeeds or aborts the whole run with a non-zero exit code.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
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
const BACKEND_DIR = 'apps/backend';
// Files the Nest CLI reads (config) or edits (app.module.ts) when generating the module.
const NEST_SANDBOX_FILES = ['package.json', 'nest-cli.json', 'tsconfig.json', 'tsconfig.build.json', 'src/app.module.ts'];
const BACKEND_CONTROLLER_TEMPLATE = path.resolve(SCRIPT_DIR, '..', 'assets', 'backend-module-template', 'controller.ts');
const endpointMessage = (moduleName) => `Hello from the ${moduleName} module!`;
const HTTP_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 10;
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

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Polls the URL until it answers 200 with the expected body (or the timeout expires).
async function waitForBody(url, expected, proc) {
  const deadline = Date.now() + HTTP_TIMEOUT_MS;
  let last = 'no response';
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) fail(`The backend exited with code ${proc.exitCode} before answering ${url}.`);
    try {
      const res = await fetch(url);
      const body = await res.text();
      if (res.status === 200 && body === expected) return;
      last = `HTTP ${res.status}: ${body.slice(0, 200)}`;
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`GET ${url} did not return "${expected}" within ${HTTP_TIMEOUT_MS / 1000}s (last: ${last}).`);
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
if (!fs.existsSync(BACKEND_CONTROLLER_TEMPLATE)) fail(`Template not found: ${BACKEND_CONTROLLER_TEMPLATE}`);
const rootPkgFile = path.join(root, 'package.json');
if (!fs.existsSync(rootPkgFile)) fail(`No package.json in ${root}: run this at the monorepo root.`);
const appPkgFiles = CONSUMER_APPS.map((app) => path.join(root, app, 'package.json'));
for (const file of appPkgFiles) {
  if (!fs.existsSync(file)) fail(`Missing ${path.relative(root, file)}: the monorepo must have apps/frontend and apps/backend.`);
}
const moduleDir = path.join(root, 'modules', moduleName);
if (fs.existsSync(moduleDir)) fail(`modules/${moduleName} already exists. Nothing was changed.`);
const backendDir = path.join(root, BACKEND_DIR);
const appModuleFile = path.join(backendDir, 'src', 'app.module.ts');
if (!fs.existsSync(appModuleFile)) fail(`Missing ${BACKEND_DIR}/src/app.module.ts: the backend must be a NestJS app.`);
if (!fs.existsSync(path.join(backendDir, 'nest-cli.json'))) fail(`Missing ${BACKEND_DIR}/nest-cli.json: the backend must be a NestJS app.`);
const backendModuleRel = `${BACKEND_DIR}/src/modules/${moduleName}`;
const backendModuleDir = path.join(root, backendModuleRel);
if (fs.existsSync(backendModuleDir)) fail(`${backendModuleRel} already exists. Nothing was changed.`);
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

step(`Create the NestJS module ${backendModuleRel} and register it in AppModule`);
// Use the same @nestjs/cli version the backend has installed, so the output matches its Nest version.
const nestCliPkg = [path.join(backendDir, 'node_modules', '@nestjs', 'cli', 'package.json'), path.join(root, 'node_modules', '@nestjs', 'cli', 'package.json')]
  .find((file) => fs.existsSync(file));
if (!nestCliPkg) fail('@nestjs/cli not found in node_modules (is it a devDependency of the backend?).');
const nestCliVersion = readJson(nestCliPkg).version;
// The CLI runs in a temporary copy of the backend config + app.module.ts, outside the monorepo: inside it,
// npm hoisting can make @nestjs/schematics load an incompatible root "typescript" and the CLI fails.
// npx installs @nestjs/cli with its own dependencies; the generated files are then copied back.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'config-new-module-'));
try {
  for (const rel of NEST_SANDBOX_FILES) {
    const src = path.join(backendDir, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(sandbox, rel)), { recursive: true });
    fs.copyFileSync(src, path.join(sandbox, rel));
  }
  const nest = ['--yes', `@nestjs/cli@${nestCliVersion}`];
  run('npx', [...nest, 'g', 'module', `modules/${moduleName}`], sandbox);
  run('npx', [...nest, 'g', 'controller', `modules/${moduleName}`, '--no-spec'], sandbox);
  // The Nest CLI exits with 0 even when the schematic fails, so check the output before copying it back.
  const sandboxModuleDir = path.join(sandbox, 'src', 'modules', moduleName);
  for (const file of [`${moduleName}.module.ts`, `${moduleName}.controller.ts`]) {
    if (!fs.existsSync(path.join(sandboxModuleDir, file))) fail(`The Nest CLI did not generate ${file}.`);
  }
  fs.cpSync(sandboxModuleDir, backendModuleDir, { recursive: true });
  fs.copyFileSync(path.join(sandbox, 'src', 'app.module.ts'), appModuleFile);
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
ok(`generated with @nestjs/cli@${nestCliVersion}`);
const nestModuleFile = path.join(backendModuleDir, `${moduleName}.module.ts`);
const controllerFile = path.join(backendModuleDir, `${moduleName}.controller.ts`);
for (const file of [nestModuleFile, controllerFile]) {
  if (!fs.existsSync(file)) fail(`${path.relative(root, file)} was not generated by the Nest CLI.`);
}
// Keep the class name and route chosen by the Nest CLI; only the controller body comes from the template.
const generatedController = fs.readFileSync(controllerFile, 'utf8');
const controllerClass = generatedController.match(/export class (\w+)/)?.[1];
const route = generatedController.match(/@Controller\('([^']*)'\)/)?.[1];
if (!controllerClass || route === undefined) fail(`Could not read the class name/route of ${path.relative(root, controllerFile)}.`);
const moduleClass = fs.readFileSync(nestModuleFile, 'utf8').match(/export class (\w+)/)?.[1];
if (!moduleClass) fail(`Could not read the class name of ${path.relative(root, nestModuleFile)}.`);
if (!fs.readFileSync(nestModuleFile, 'utf8').includes(controllerClass)) {
  fail(`${controllerClass} is not declared in ${path.relative(root, nestModuleFile)}.`);
}
const appModule = fs.readFileSync(appModuleFile, 'utf8');
if (!appModule.includes(`./modules/${moduleName}/${moduleName}.module`) || !new RegExp(`imports:\\s*\\[[^\\]]*\\b${moduleClass}\\b`).test(appModule)) {
  fail(`${moduleClass} was not registered in ${BACKEND_DIR}/src/app.module.ts.`);
}
const message = endpointMessage(moduleName);
let controllerContent = fs.readFileSync(BACKEND_CONTROLLER_TEMPLATE, 'utf8');
for (const [placeholder, value] of [['__ROUTE__', route], ['__CONTROLLER_CLASS__', controllerClass], ['__MESSAGE__', message]]) {
  controllerContent = controllerContent.split(placeholder).join(value);
}
fs.writeFileSync(controllerFile, controllerContent);
ok(path.relative(root, nestModuleFile));
ok(`${path.relative(root, controllerFile)} (GET /${route} -> "${message}")`);
ok(`${moduleClass} registered in AppModule imports`);

step('Build the project (npm run build)');
run('npm', ['run', 'build'], root);
if (!fs.existsSync(path.join(moduleDir, 'dist', 'index.js'))) fail(`modules/${moduleName}/dist/index.js was not generated.`);
ok(`modules/${moduleName}/dist generated`);
const backendMain = path.join(backendDir, 'dist', 'main.js');
const builtController = path.join(backendDir, 'dist', 'modules', moduleName, `${moduleName}.controller.js`);
if (!fs.existsSync(builtController)) fail(`${path.relative(root, builtController)} was not generated.`);
ok(`${BACKEND_DIR}/dist/modules/${moduleName} generated`);

step(`Run the module tests (npm test -w ${packageName})`);
run('npm', ['test', '-w', packageName], root);
ok('tests passed');

step(`Verify the backend answers GET /${route}`);
{
  // A random free port (PORT in the environment overrides apps/backend/.env) so a running dev server doesn't conflict.
  const port = await freePort();
  const url = `http://localhost:${port}/${route}`;
  const proc = spawn('node', [backendMain], { cwd: backendDir, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    await waitForBody(url, message, proc);
  } finally {
    proc.kill();
  }
  ok(`GET ${url} -> "${message}"`);
}

step('Summary');
ok(`Module ${packageName} created at modules/${moduleName}`);
ok(`Dependency added to ${CONSUMER_APPS.join(' and ')}`);
ok(`NestJS module ${moduleClass} at ${backendModuleRel}, registered in AppModule, endpoint GET /${route}`);
ok('Install, build, tests and endpoint check succeeded');
