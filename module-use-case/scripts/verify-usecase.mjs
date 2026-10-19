#!/usr/bin/env node
// Verifies a use case and its unit test against the project pattern.
//
// Steps (any failure aborts with a non-zero exit code):
//   1. Static checks: file name and folder, no "TODO(module-use-case)" markers (use case, test,
//      test/mock), `export class <Name>` without a "UseCase" suffix, `export interface <Name>In`,
//      `implements UseCase<<Name>In, <Name>Out | void>` with `<Name>Out` declared when used, no
//      backend/HTTP/Prisma imports, export chain from usecase/index.ts up to src/index.ts, the test
//      exists and neither it nor the fakes use a mock framework
//   2. Type check: tsc --noEmit on the module
//   3. The use case test with coverage limited to the use case file, 100% threshold
//   4. Full module test suite (no regressions)
//
// Usage:
//   node verify-usecase.mjs --module <module> (--path <file> | --aggregate <name> --name <use case>)
//     [--cwd <monorepo root>]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  FORBIDDEN_IMPORTS,
  MARKER,
  MOCK_FRAMEWORKS,
  exportChain,
  fail,
  hasExport,
  listTsFiles,
  ok,
  parseArgs,
  rel,
  resolveModule,
  resolveName,
  resolveTarget,
} from "./lib.mjs";

const FULL_COVERAGE = JSON.stringify({
  global: { statements: 100, branches: 100, functions: 100, lines: 100 },
});

function step(n, msg) {
  console.log(`\n\x1b[36m[${n}/4] ${msg}\x1b[0m`);
}

function run(cmd, cmdArgs, cwd) {
  console.log(`  $ ${cmd} ${cmdArgs.join(" ")}`);
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  if (result.status !== 0) fail(`Command failed: ${cmd} ${cmdArgs.join(" ")}`);
}

const args = parseArgs(process.argv.slice(2), {
  "--module": { key: "module" },
  "--aggregate": { key: "aggregate" },
  "--path": { key: "path" },
  "--name": { key: "name" },
});
if (args.aggregate && !args.name) fail("--aggregate requires --name <use case name>");

const { cwd } = args;
const mod = resolveModule(cwd, args.module);
const target = resolveTarget(cwd, mod, { ...args, name: args.name ? resolveName(args.name) : undefined });
const name = target.name.pascal;

// 1. Static checks -----------------------------------------------------------------------------
step(1, "Static checks");

for (const file of [target.file, target.testFile]) {
  if (!fs.existsSync(file)) fail(`Missing ${rel(cwd, file)}`);
}
const mockFiles = listTsFiles(path.join(mod.testDir, "mock"));
for (const file of [target.file, target.testFile, ...mockFiles]) {
  if (fs.readFileSync(file, "utf8").includes(MARKER)) fail(`${rel(cwd, file)} still has "${MARKER}" markers.`);
}
ok("files exist and have no pending markers");

const source = fs.readFileSync(target.file, "utf8");
for (const match of source.matchAll(/export\s+class\s+([A-Za-z0-9_]+)/g)) {
  if (/UseCase$/i.test(match[1])) fail(`Class "${match[1]}" must not end with "UseCase". Use "${match[1].replace(/UseCase$/i, "")}".`);
}
if (!new RegExp(`export\\s+class\\s+${name}\\b`).test(source)) fail(`${rel(cwd, target.file)} must declare "export class ${name}".`);
if (!new RegExp(`export\\s+(interface|type)\\s+${name}In\\b`).test(source)) {
  fail(`${rel(cwd, target.file)} must declare the input contract "export interface ${name}In".`);
}
const contract = new RegExp(`export\\s+class\\s+${name}\\s+implements\\s+UseCase\\s*<\\s*${name}In\\s*,\\s*([A-Za-z0-9_]+)\\s*>`).exec(
  source.replace(/\s+/g, " "),
);
if (!contract) fail(`${name} must implement the shared contract: "implements UseCase<${name}In, ${name}Out | void>".`);
const outType = contract[1];
if (outType !== "void" && outType !== `${name}Out`) fail(`The output of ${name} must be "${name}Out" or "void", got "${outType}".`);
if (outType === `${name}Out` && !new RegExp(`export\\s+(interface|type)\\s+${name}Out\\b`).test(source)) {
  fail(`${rel(cwd, target.file)} must declare the output contract "export interface ${name}Out".`);
}
if (/export\s+(interface|type)\s+\w+Input\b/.test(source)) {
  console.log(`  ! ${rel(cwd, target.file)} mentions an "...Input" type: new contracts use the "In" / "Out" suffixes.`);
}
const forbidden = FORBIDDEN_IMPORTS.exec(source);
if (forbidden) fail(`${rel(cwd, target.file)} must not depend on backend, HTTP or Prisma code: ${forbidden[0]}`);
ok(`export class ${name} implements UseCase<${name}In, ${outType}>`);

const chain = [
  { indexFile: target.indexFile, spec: `./${path.basename(target.file, ".ts")}` },
  ...exportChain(target.usecaseDir, mod.srcDir),
];
for (const { indexFile, spec } of chain) {
  if (!fs.existsSync(indexFile) || !hasExport(fs.readFileSync(indexFile, "utf8"), spec)) {
    fail(`${rel(cwd, indexFile)} must have: export * from "${spec}";`);
  }
}
ok("export chain up to src/index.ts");

for (const file of [target.testFile, ...mockFiles]) {
  if (MOCK_FRAMEWORKS.test(fs.readFileSync(file, "utf8"))) {
    fail(`${rel(cwd, file)} must not use a mock framework. Use the concrete fakes of test/mock (or a small subclass).`);
  }
}
ok("test and fakes use no mock framework");

// 2. Type check --------------------------------------------------------------------------------
step(2, "Type check");
run("npx", ["tsc", "--noEmit", "-p", path.join(mod.moduleDir, "tsconfig.json")], cwd);
ok("module compiles");

// 3. Use case coverage -------------------------------------------------------------------------
step(3, "Use case test with 100% coverage of the use case");
run(
  "npx",
  [
    "jest",
    rel(mod.moduleDir, target.testFile),
    "--coverage",
    `--collectCoverageFrom=${rel(mod.moduleDir, target.file)}`,
    `--coverageThreshold=${FULL_COVERAGE}`,
    "--coverageReporters=text",
    "--coverageDirectory=coverage/module-use-case",
  ],
  mod.moduleDir,
);
ok("use case fully covered by its own test");

// 4. Full suite --------------------------------------------------------------------------------
step(4, "Full module test suite");
run("npx", ["jest"], mod.moduleDir);
ok("module suite passes");

console.log(`\n\x1b[32m✔ ${name} verified.\x1b[0m`);
