#!/usr/bin/env node
// Deterministic scaffolder for a Turborepo monorepo with a Next.js frontend
// (port 3000) and a NestJS backend (port 4000) that reads env vars via @nestjs/config.
//
// The project is created directly inside the current directory (or --cwd): no
// new project folder is made. --name only sets the root package name and
// defaults to the directory's name.
//
// Usage:
//   node setup.mjs [--name <project-name>] [--namespace <@scope>] [--cwd <dir>] [--skip-verify]
//
// Every step either succeeds or aborts the whole run with a non-zero exit code.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Constants (the "spec" of the generated project)
// ---------------------------------------------------------------------------

const STAGING_DIR = '.config-project-fullstack-tmp'; // where create-turbo runs before being moved into place
// The target directory must not already contain any of these: they would clash
// with (or be silently mixed into) the generated monorepo.
const CONFLICTING_ENTRIES = ['package.json', 'package-lock.json', 'turbo.json', 'apps', 'packages', 'node_modules'];
const FRONTEND_PORT = 3000;
const BACKEND_PORT = 4000;
const ENV_CHECK_PORT = 4123; // used only to prove the backend reads apps/backend/.env
const MIN_NODE_MAJOR = 20;
const HTTP_TIMEOUT_MS = 180_000;

// Recent Nest CLI templates (v12+) are ESM ("type": "module", moduleResolution
// "nodenext"), where relative imports need an explicit ".js" suffix. The content
// is otherwise identical; the suffix is chosen from the generated template.
const appModuleTs = (ext) => `import { Module } from '@nestjs/common';
import { AppController } from './app.controller${ext}';
import { AppService } from './app.service${ext}';
import { ConfigModule } from '@nestjs/config';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
`;

const mainTs = (ext) => `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module${ext}';

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.enableCors();
	await app.listen(process.env.PORT ?? 4000);
}

bootstrap();
`;

const FRONTEND_ENV = `NEXT_PUBLIC_API_URL=http://localhost:${BACKEND_PORT}\n`;
const BACKEND_ENV = `PORT=${BACKEND_PORT}\n`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 17;
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
  const args = { name: null, namespace: null, cwd: process.cwd(), verify: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) fail(`Missing value for ${a}`);
      return v;
    };
    if (a === '--name') args.name = next();
    else if (a === '--namespace') args.namespace = next();
    else if (a === '--cwd') args.cwd = path.resolve(next());
    else if (a === '--skip-verify') args.verify = false;
    else if (a === '--help' || a === '-h') {
      console.log('node setup.mjs [--name <project-name>] [--namespace <@scope>] [--cwd <dir>] [--skip-verify]');
      process.exit(0);
    } else fail(`Unknown argument: ${a}`);
  }
  return args;
}

// Child processes must not inherit a PORT from the user's shell: it would
// override apps/backend/.env and make Next.js leave port 3000.
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.PORT;
  return env;
}

function run(cmd, args, cwd, { allowFail = false } = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}   (in ${cwd})`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'], // no stdin: an unexpected prompt fails instead of hanging
    env: childEnv({ CI: '1' }),
  });
  if (res.error) {
    if (allowFail) return false;
    fail(`Failed to start "${cmd}": ${res.error.message}`);
  }
  if (res.status !== 0) {
    if (allowFail) return false;
    fail(`Command failed (exit ${res.status}): ${cmd} ${args.join(' ')}`);
  }
  return true;
}

function commandExists(cmd) {
  const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !res.error && res.status === 0;
}

function assertInside(parent, child) {
  const rel = path.relative(parent, child);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    fail(`Refusing to touch ${child}: it is not inside ${parent}`);
  }
}

// Turns a directory name into a valid npm package name.
function nameFromDir(dir) {
  const name = path
    .basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|-+$/g, '');
  return name || 'project';
}

// Moves the create-turbo output from the staging folder into the target directory.
// Files the target already has (README.md, .npmrc...) are kept; .gitignore is merged.
function moveIntoTarget(src, dest) {
  for (const entry of fs.readdirSync(src)) {
    const from = path.join(src, entry);
    const to = path.join(dest, entry);
    if (!fs.existsSync(to)) {
      fs.renameSync(from, to);
    } else if (entry === '.gitignore') {
      const existing = fs.readFileSync(to, 'utf8');
      const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
      const missing = fs
        .readFileSync(from, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith('#') && !have.has(l.trim()));
      if (missing.length) {
        const sep = existing.endsWith('\n') || existing === '' ? '' : '\n';
        fs.writeFileSync(to, `${existing}${sep}\n# Turborepo / Next.js / NestJS\n${missing.join('\n')}\n`);
      }
      ok(`.gitignore already existed — merged ${missing.length} missing entr${missing.length === 1 ? 'y' : 'ies'}`);
    } else {
      ok(`${entry} already exists — kept the existing one`);
    }
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

async function assertPortsFree(ports) {
  for (const p of ports) {
    if (!(await isPortFree(p))) fail(`Port ${p} is already in use. Stop whatever is using it and run again.`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, { timeoutMs = HTTP_TIMEOUT_MS, expectBody } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const body = await res.text();
      if (res.ok && (!expectBody || body.includes(expectBody))) return body;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e.cause?.code ?? e.message;
    }
    await sleep(1_000);
  }
  throw new Error(`${url} did not respond correctly within ${timeoutMs / 1000}s (last: ${lastErr})`);
}

const children = new Set();
function startBackground(cmd, args, cwd) {
  console.log(`  $ ${cmd} ${args.join(' ')}   (in ${cwd}, background)`);
  const child = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv(),
    detached: true, // own process group so the whole tree can be killed
  });
  let output = '';
  const collect = (d) => {
    output += d.toString();
    if (output.length > 20_000) output = output.slice(-20_000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  children.add(child);
  child.getOutput = () => output;
  return child;
}

async function stopBackground(child) {
  if (!children.has(child)) return;
  children.delete(child);
  const killGroup = (sig) => {
    try {
      process.kill(-child.pid, sig);
    } catch {
      /* already gone */
    }
  };
  killGroup('SIGTERM');
  for (let i = 0; i < 20 && child.exitCode === null && child.signalCode === null; i++) await sleep(250);
  killGroup('SIGKILL');
  await sleep(500);
}

function killAllChildren() {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
}
process.on('exit', killAllChildren);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

// ---------------------------------------------------------------------------
// Namespace rename (runs after the whole scaffold, so it cannot break it)
// ---------------------------------------------------------------------------

const TEXT_EXT = new Set(['.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.mts', '.cts', '.md', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', '.git', 'build', 'coverage']);

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(path.join(dir, entry.name), out);
    } else if (entry.isFile() && TEXT_EXT.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function workspacePackageJsons(root) {
  const result = [];
  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(root, group);
    if (!fs.existsSync(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
      const pj = path.join(groupDir, entry.name, 'package.json');
      if (entry.isDirectory() && fs.existsSync(pj)) result.push(pj);
    }
  }
  return result.sort();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyNamespace(root, namespace) {
  const pkgFiles = workspacePackageJsons(root);
  const renames = new Map(); // oldName -> newName
  for (const pj of pkgFiles) {
    const name = readJson(pj).name;
    if (!name) continue;
    const bare = name.includes('/') ? name.split('/')[1] : name;
    const newName = `${namespace}/${bare}`;
    if (newName !== name) renames.set(name, newName);
  }
  if (renames.size === 0) {
    ok('All workspace packages already use the requested namespace');
    return;
  }

  // 1) package.json files: "name" plus every dependency field.
  const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  for (const pj of pkgFiles) {
    const data = readJson(pj);
    if (renames.has(data.name)) data.name = renames.get(data.name);
    for (const field of depFields) {
      if (!data[field]) continue;
      const rebuilt = {};
      for (const [dep, ver] of Object.entries(data[field])) rebuilt[renames.get(dep) ?? dep] = ver;
      data[field] = rebuilt;
    }
    writeJson(pj, data);
  }

  // 2) Source/config references (imports, tsconfig "extends", eslint configs...).
  //    Only scoped names are replaced: a bare name like "backend" is too generic
  //    to rewrite safely in free text.
  const scoped = [...renames.entries()].filter(([oldName]) => oldName.startsWith('@'));
  const files = [
    ...walkFiles(path.join(root, 'apps')),
    ...(fs.existsSync(path.join(root, 'packages')) ? walkFiles(path.join(root, 'packages')) : []),
  ];
  for (const file of files) {
    if (path.basename(file) === 'package-lock.json') continue;
    let text = fs.readFileSync(file, 'utf8');
    let changed = false;
    for (const [oldName, newName] of scoped) {
      const re = new RegExp(escapeRegex(oldName) + '(?=[/"\'`])', 'g');
      if (re.test(text)) {
        text = text.replace(re, newName);
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(file, text);
  }

  // 3) Drop stale workspace symlinks; `npm install` recreates them with the new names.
  for (const oldName of renames.keys()) {
    const link = path.join(root, 'node_modules', ...oldName.split('/'));
    if (fs.existsSync(link)) fs.rmSync(link, { recursive: true, force: true });
  }

  for (const [o, n] of renames) ok(`${o} -> ${n}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.name === null) args.name = nameFromDir(args.cwd);

  // ---- Step 1: preflight -------------------------------------------------
  step('Preflight checks');
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(args.name)) {
    fail(`Invalid project name "${args.name}". Use lowercase letters, digits, ".", "_" or "-".`);
  }
  if (args.namespace !== null) {
    if (!args.namespace.startsWith('@')) args.namespace = `@${args.namespace}`;
    args.namespace = args.namespace.replace(/\/+$/, '');
    if (!/^@[a-z0-9][a-z0-9._-]*$/.test(args.namespace)) {
      fail(`Invalid namespace "${args.namespace}". Expected something like @my-company.`);
    }
  }
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < MIN_NODE_MAJOR) fail(`Node.js >= ${MIN_NODE_MAJOR} is required (found ${process.versions.node}).`);
  for (const bin of ['npm', 'npx']) if (!commandExists(bin)) fail(`"${bin}" was not found on PATH.`);
  if (!fs.existsSync(args.cwd) || !fs.statSync(args.cwd).isDirectory()) fail(`--cwd ${args.cwd} is not a directory.`);

  const root = args.cwd;
  const apps = path.join(root, 'apps');
  const frontend = path.join(apps, 'frontend');
  const backend = path.join(apps, 'backend');
  const staging = path.join(root, STAGING_DIR);
  const existing = CONFLICTING_ENTRIES.filter((e) => fs.existsSync(path.join(root, e)));
  if (existing.length) {
    fail(`${root} already contains ${existing.join(', ')}. This skill only creates projects from scratch; run it in a directory without them.`);
  }
  if (args.verify) await assertPortsFree([FRONTEND_PORT, BACKEND_PORT, ENV_CHECK_PORT]);
  ok(`Node ${process.versions.node}, project will be created in ${root} (root package name: ${args.name})`);
  if (args.namespace) ok(`Namespace to apply at the end: ${args.namespace}`);

  // ---- Step 2: create-turbo ----------------------------------------------
  // create-turbo refuses non-empty folders, so it runs in a staging folder and
  // its output is then moved into the current directory.
  step('Create Turborepo in the current directory (npx create-turbo@latest <name> -m npm)');
  assertInside(root, staging);
  fs.rmSync(staging, { recursive: true, force: true }); // leftover from an interrupted run
  fs.mkdirSync(staging);
  try {
    run('npx', ['--yes', 'create-turbo@latest', args.name, '-m', 'npm', '--skip-install', '--no-git'], staging);
    const generated = path.join(staging, args.name);
    if (!fs.existsSync(path.join(generated, 'turbo.json'))) fail('turbo.json not found after create-turbo.');
    moveIntoTarget(generated, root);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  if (!fs.existsSync(path.join(root, 'turbo.json'))) fail('turbo.json not found in the current directory.');
  ok('Turborepo created');

  // ---- Step 3: clear apps/* ----------------------------------------------
  step('Remove the example apps (rm -rf apps/*)');
  assertInside(root, apps);
  fs.mkdirSync(apps, { recursive: true });
  for (const entry of fs.readdirSync(apps)) {
    const target = path.join(apps, entry);
    assertInside(apps, target);
    fs.rmSync(target, { recursive: true, force: true });
  }
  if (fs.readdirSync(apps).length !== 0) fail('apps/ is not empty after cleanup.');
  ok('apps/ is empty');

  // ---- Step 4: create-next-app -------------------------------------------
  step('Create Next.js frontend (npx create-next-app@latest frontend --yes --src-dir)');
  run('npx', ['--yes', 'create-next-app@latest', 'frontend', '--yes', '--src-dir', '--use-npm', '--disable-git'], apps);
  if (!fs.existsSync(path.join(frontend, 'package.json'))) fail('apps/frontend/package.json missing.');
  if (!fs.existsSync(path.join(frontend, 'src'))) fail('apps/frontend/src missing (--src-dir not applied).');
  ok('Frontend created');

  // ---- Step 5: Nest CLI ---------------------------------------------------
  step('Install Nest CLI globally (npm i -g @nestjs/cli)');
  let nestCmd = ['nest'];
  if (run('npm', ['i', '-g', '@nestjs/cli'], apps, { allowFail: true }) && commandExists('nest')) {
    ok('nest CLI available globally');
  } else {
    nestCmd = ['npx', '--yes', '@nestjs/cli'];
    ok('Global install unavailable (permissions?) — falling back to "npx @nestjs/cli"');
  }

  // ---- Step 6: nest new ---------------------------------------------------
  step('Create NestJS backend (nest new backend -g -p npm)');
  run(nestCmd[0], [...nestCmd.slice(1), 'new', 'backend', '-g', '-p', 'npm'], apps);
  if (!fs.existsSync(path.join(backend, 'src', 'main.ts'))) fail('apps/backend/src/main.ts missing.');
  ok('Backend created');

  // ---- Step 7: @nestjs/config --------------------------------------------
  step('Install @nestjs/config in the backend');
  run('npm', ['install', '@nestjs/config'], backend);
  if (!readJson(path.join(backend, 'package.json')).dependencies?.['@nestjs/config']) {
    fail('@nestjs/config is not listed in apps/backend/package.json dependencies.');
  }
  ok('@nestjs/config installed');

  // ---- Step 8: app.module.ts ---------------------------------------------
  step('Write apps/backend/src/app.module.ts (ConfigModule.forRoot, isGlobal)');
  const isEsm = readJson(path.join(backend, 'package.json')).type === 'module';
  const importExt = isEsm ? '.js' : '';
  fs.writeFileSync(path.join(backend, 'src', 'app.module.ts'), appModuleTs(importExt));
  ok(`app.module.ts written (${isEsm ? 'ESM template: ".js" import suffixes' : 'CommonJS template'})`);

  // ---- Step 9: main.ts ----------------------------------------------------
  step('Write apps/backend/src/main.ts (port 4000, CORS enabled)');
  fs.writeFileSync(path.join(backend, 'src', 'main.ts'), mainTs(importExt));
  ok('main.ts written');

  // ---- Step 10: dev script ------------------------------------------------
  step('Add "dev": "nest start --watch" to apps/backend/package.json');
  const backendPkgPath = path.join(backend, 'package.json');
  const backendPkg = readJson(backendPkgPath);
  backendPkg.scripts = { ...backendPkg.scripts, dev: 'nest start --watch' };
  writeJson(backendPkgPath, backendPkg);
  ok('dev script added');

  // ---- Step 11: env files -------------------------------------------------
  step('Create .env.example and .env for frontend and backend');
  fs.writeFileSync(path.join(frontend, '.env.example'), FRONTEND_ENV);
  fs.copyFileSync(path.join(frontend, '.env.example'), path.join(frontend, '.env'));
  fs.writeFileSync(path.join(backend, '.env.example'), BACKEND_ENV);
  fs.copyFileSync(path.join(backend, '.env.example'), path.join(backend, '.env'));
  ok('apps/frontend/.env(.example) and apps/backend/.env(.example) created');

  // ---- Step 12: root install ---------------------------------------------
  step('Install/link all workspaces from the monorepo root (npm install)');
  run('npm', ['install'], root);
  ok('Workspaces installed');

  // ---- Step 13: build backend --------------------------------------------
  step('Build the backend (npm run build)');
  run('npm', ['run', 'build'], backend);
  if (!fs.existsSync(path.join(backend, 'dist', 'main.js'))) fail('apps/backend/dist/main.js missing after build.');
  ok('Backend compiled');

  // ---- Step 14: env-reading check ----------------------------------------
  step(`Verify the backend reads apps/backend/.env (temporary PORT=${ENV_CHECK_PORT})`);
  if (args.verify) {
    const envPath = path.join(backend, '.env');
    const original = fs.readFileSync(envPath, 'utf8');
    fs.writeFileSync(envPath, `PORT=${ENV_CHECK_PORT}\n`);
    const proc = startBackground('node', ['dist/main.js'], backend);
    try {
      await waitForHttp(`http://localhost:${ENV_CHECK_PORT}/`, { timeoutMs: 60_000 });
      ok(`Backend listened on ${ENV_CHECK_PORT}, the value from .env — env vars are being loaded`);
    } catch (e) {
      console.error(proc.getOutput());
      fail(`Env check failed: ${e.message}`);
    } finally {
      await stopBackground(proc);
      fs.writeFileSync(envPath, original);
    }
    if (fs.readFileSync(envPath, 'utf8') !== BACKEND_ENV) fail('apps/backend/.env was not restored correctly.');
  } else ok('Skipped (--skip-verify)');

  // ---- Step 15: namespace -------------------------------------------------
  step('Apply namespace to workspace packages');
  if (args.namespace) {
    applyNamespace(root, args.namespace);
  } else ok('No --namespace given — package names left unchanged');

  // ---- Step 16: reinstall -------------------------------------------------
  step('Re-sync workspaces after renames (npm install)');
  if (args.namespace) {
    run('npm', ['install'], root);
    ok('Workspaces re-linked');
  } else ok('Nothing to re-sync');

  // ---- Step 17: full dev check -------------------------------------------
  step(`Verify "npm run dev" serves frontend on ${FRONTEND_PORT} and backend on ${BACKEND_PORT}`);
  if (args.verify) {
    await assertPortsFree([FRONTEND_PORT, BACKEND_PORT]);
    const dev = startBackground('npm', ['run', 'dev'], root);
    try {
      await waitForHttp(`http://localhost:${BACKEND_PORT}/`, { expectBody: 'Hello World' });
      ok(`Backend responding on http://localhost:${BACKEND_PORT}`);
      await waitForHttp(`http://localhost:${FRONTEND_PORT}/`);
      ok(`Frontend responding on http://localhost:${FRONTEND_PORT}`);
      const cors = await fetch(`http://localhost:${BACKEND_PORT}/`, {
        headers: { Origin: `http://localhost:${FRONTEND_PORT}` },
      });
      if (!cors.headers.get('access-control-allow-origin')) fail('Backend did not return CORS headers.');
      ok('CORS enabled on backend');
    } catch (e) {
      console.error(dev.getOutput());
      fail(`Dev check failed: ${e.message}`);
    } finally {
      await stopBackground(dev);
    }
  } else ok('Skipped (--skip-verify)');

  // ---- Summary ------------------------------------------------------------
  const names = workspacePackageJsons(root).map((pj) => `${path.relative(root, path.dirname(pj))}: ${readJson(pj).name}`);
  console.log(`\n\x1b[32m✔ Project ready at ${root}\x1b[0m`);
  console.log(`  Frontend: http://localhost:${FRONTEND_PORT}  |  Backend: http://localhost:${BACKEND_PORT}`);
  console.log('  Packages:');
  for (const n of names) console.log(`    - ${n}`);
  console.log('\n  Start everything with:\n    npm run dev');
}

main().catch((e) => fail(e.stack ?? String(e)));
