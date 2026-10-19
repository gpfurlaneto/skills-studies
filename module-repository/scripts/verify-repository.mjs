#!/usr/bin/env node
// Verifies a repository contract and its in-memory fake against the project pattern.
//
// Steps (any failure aborts with a non-zero exit code):
//   1. Static checks: files exist, no "TODO(module-repository)" markers, `export interface
//      <Entity>Repository`, no shared method (create/update/delete/findById/findPage) redeclared by
//      hand in the interface, the fake `implements <Entity>Repository` without any mock framework,
//      export chain from provider/index.ts up to src/index.ts and from test/mock/index.ts
//   2. Type check: tsc --noEmit on the module
//   3. Fake test with coverage limited to the fake file, 100% threshold
//   4. Full module test suite (no regressions)
//
// Usage:
//   node verify-repository.mjs --module <module> (--aggregate <name> | --path <file>)
//     [--entity <Name>] [--fake-path <file>] [--cwd <monorepo root>]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  MARKER,
  SHARED_METHODS,
  exportChain,
  fail,
  hasExport,
  importPath,
  ok,
  rel,
  resolveEntity,
  resolveFake,
  resolveModule,
  resolveRepositoryTarget,
} from "./lib.mjs";

const FULL_COVERAGE = JSON.stringify({
  global: { statements: 100, branches: 100, functions: 100, lines: 100 },
});
const MOCK_FRAMEWORKS = /\bjest\.(fn|mock|spyOn)\b|\bvi\.(fn|mock|spyOn)\b|from\s+["'](sinon|ts-mockito|jest-mock-extended|@golevelup\/ts-jest)["']/;

function step(n, msg) {
  console.log(`\n\x1b[36m[${n}/4] ${msg}\x1b[0m`);
}

function run(cmd, cmdArgs, cwd) {
  console.log(`  $ ${cmd} ${cmdArgs.join(" ")}`);
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  if (result.status !== 0) fail(`Command failed: ${cmd} ${cmdArgs.join(" ")}`);
}

const args = { cwd: process.cwd() };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const flag = argv[i];
  const value = argv[i + 1];
  if (!["--module", "--aggregate", "--path", "--entity", "--fake-path", "--cwd"].includes(flag)) {
    fail(`Unknown option: ${flag}`);
  }
  if (value === undefined) fail(`Missing value for ${flag}`);
  i += 1;
  if (flag === "--module") args.module = value;
  else if (flag === "--aggregate") args.aggregate = value;
  else if (flag === "--path") args.path = value;
  else if (flag === "--entity") args.entity = value;
  else if (flag === "--fake-path") args.fakePath = value;
  else args.cwd = path.resolve(value);
}

const { cwd } = args;
const mod = resolveModule(cwd, args.module);
const target = resolveRepositoryTarget(cwd, mod, args);
const entity = resolveEntity(cwd, mod, target, args.entity);
const fake = resolveFake(cwd, mod, target, entity, args.fakePath);
const repositoryName = `${entity.name}Repository`;

// 1. Static checks -----------------------------------------------------------------------------
step(1, "Static checks");

for (const file of [target.file, fake.file, fake.testFile]) {
  if (!fs.existsSync(file)) fail(`Missing ${rel(cwd, file)}`);
  if (fs.readFileSync(file, "utf8").includes(MARKER)) fail(`${rel(cwd, file)} still has "${MARKER}" markers.`);
}
ok("files exist and have no pending markers");

const repository = fs.readFileSync(target.file, "utf8");
const declaration = new RegExp(`export\\s+interface\\s+${repositoryName}\\b([^{]*)\\{`).exec(repository);
if (!declaration) fail(`${rel(cwd, target.file)} must declare "export interface ${repositoryName}".`);
let depth = 1;
let end = declaration.index + declaration[0].length;
while (depth > 0 && end < repository.length) {
  if (repository[end] === "{") depth += 1;
  if (repository[end] === "}") depth -= 1;
  end += 1;
}
const body = repository.slice(declaration.index + declaration[0].length, end - 1);
const redeclared = SHARED_METHODS.filter((name) => new RegExp(`^\\s*${name}\\s*[(<]`, "m").test(body));
if (redeclared.length) {
  fail(
    `${repositoryName} redeclares shared methods by hand: ${redeclared.join(", ")}. ` +
      "Compose the shared contracts (CrudRepository or the granular ones) instead.",
  );
}
ok(`export interface ${repositoryName} reuses the shared contracts`);

const fakeSource = fs.readFileSync(fake.file, "utf8");
if (!new RegExp(`export\\s+class\\s+${fake.className}\\s+implements\\s+${repositoryName}\\b`).test(fakeSource)) {
  fail(`${rel(cwd, fake.file)} must declare "export class ${fake.className} implements ${repositoryName}".`);
}
if (MOCK_FRAMEWORKS.test(fakeSource)) fail(`${rel(cwd, fake.file)} must not use a mock framework.`);
ok(`export class ${fake.className} implements ${repositoryName} (no mock framework)`);

const chain = [
  { indexFile: path.join(target.providerDir, "index.ts"), spec: `./${path.basename(target.file, ".ts")}` },
  ...exportChain(target.providerDir, mod.srcDir),
  { indexFile: fake.indexFile, spec: importPath(fake.dir, fake.file) },
];
for (const { indexFile, spec } of chain) {
  if (!fs.existsSync(indexFile) || !hasExport(fs.readFileSync(indexFile, "utf8"), spec)) {
    fail(`${rel(cwd, indexFile)} must have: export * from "${spec}";`);
  }
}
ok("export chain up to src/index.ts and test mock index");

// 2. Type check --------------------------------------------------------------------------------
step(2, "Type check");
run("npx", ["tsc", "--noEmit", "-p", path.join(mod.moduleDir, "tsconfig.json")], cwd);
ok("module compiles");

// 3. Fake coverage -----------------------------------------------------------------------------
step(3, "Fake test with 100% coverage of the fake");
run(
  "npx",
  [
    "jest",
    rel(mod.moduleDir, fake.testFile),
    "--coverage",
    `--collectCoverageFrom=${rel(mod.moduleDir, fake.file)}`,
    `--coverageThreshold=${FULL_COVERAGE}`,
    "--coverageReporters=text",
    "--coverageDirectory=coverage/module-repository",
  ],
  mod.moduleDir,
);
ok("fake fully covered");

// 4. Full suite --------------------------------------------------------------------------------
step(4, "Full module test suite");
run("npx", ["jest"], mod.moduleDir);
ok("module suite passes");

console.log(`\n\x1b[32m✔ ${repositoryName} and ${fake.className} verified.\x1b[0m`);
