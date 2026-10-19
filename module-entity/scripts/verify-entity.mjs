#!/usr/bin/env node
// Verifies a domain entity and its unit test against the project pattern.
//
// Steps (any failure aborts with a non-zero exit code):
//   1. Static checks: files exist, no TODO markers, `<Entity>State extends EntityState`,
//      `export class <Entity> extends Entity<<Entity>State>`, the constructor only calls
//      `super(props)` (lazy validation), one getter per state field, `validate(): void` that uses
//      `Validator.validate(` with codes "<entityCode>.<field>" for every field, test imports the
//      entity from the module src/index, export chain up to src/index.ts
//   2. Type check: tsc --noEmit on the module
//   3. Entity test with coverage limited to the entity file, 100% threshold on statements,
//      branches, functions and lines
//   4. Full module test suite with coverage (no regressions)
//
// Usage:
//   node verify-entity.mjs --module <module> (--aggregate <name> | --aggregate-path <path>)
//     --entity <name> [--cwd <monorepo root>]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TODO_MARKERS = ["TODO(module-entity)", "TODO: declare the", "TODO: expose each", "TODO: validate the"];
const FULL_COVERAGE = JSON.stringify({
  global: { statements: 100, branches: 100, functions: 100, lines: 100 },
});

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}
function ok(msg) {
  console.log(`\x1b[32m  ✔ ${msg}\x1b[0m`);
}
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
  if (argv[i] === "--module") args.module = argv[++i];
  else if (argv[i] === "--aggregate") args.aggregate = argv[++i];
  else if (argv[i] === "--aggregate-path") args.aggregatePath = argv[++i];
  else if (argv[i] === "--entity") args.entity = argv[++i];
  else if (argv[i] === "--cwd") args.cwd = path.resolve(argv[++i]);
  else fail(`Unknown option: ${argv[i]}`);
}
if (!args.module) fail("Missing --module <module>");
if (!args.aggregate && !args.aggregatePath) fail("Missing --aggregate <name> or --aggregate-path <path>");
if (!args.entity) fail("Missing --entity <name>");

function toWords(raw) {
  return raw
    .trim()
    .replace(/\.entity(\.ts)?$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}
const words = toWords(args.entity);
const kebab = words.join("-");
const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
const camel = pascal[0].toLowerCase() + pascal.slice(1);

const moduleDir = path.join(args.cwd, "modules", args.module);
const srcDir = path.join(moduleDir, "src");
if (!fs.existsSync(srcDir)) fail(`Missing modules/${args.module}/src`);

const rawAggregate = args.aggregate ? toWords(args.aggregate).join("-") : args.aggregatePath;
const aggregateAbs = path.isAbsolute(rawAggregate)
  ? rawAggregate
  : rawAggregate.startsWith("modules/")
    ? path.join(args.cwd, rawAggregate)
    : path.join(srcDir, rawAggregate.replace(/^src\//, ""));
const aggregatePath = path.relative(srcDir, aggregateAbs).split(path.sep).join("/").replace(/\/model\/?$/, "");
if (!aggregatePath || aggregatePath.startsWith("..")) fail(`Aggregate "${rawAggregate}" must be inside modules/${args.module}/src`);

const rel = (file) => path.relative(moduleDir, file).split(path.sep).join("/");
const read = (file) => fs.readFileSync(file, "utf8");

function findFiles(dir, fileName) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "coverage") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(full, fileName));
    else if (entry.name === fileName) found.push(full);
  }
  return found;
}

const entityFile = path.join(srcDir, aggregatePath, "model", `${kebab}.entity.ts`);
const tests = findFiles(path.join(moduleDir, "test"), `${kebab}.entity.test.ts`);

// 1. Static checks -----------------------------------------------------------
step(1, "Static checks");
if (!fs.existsSync(entityFile)) fail(`Missing ${rel(entityFile)}`);
if (tests.length === 0) fail(`Missing test/**/${kebab}.entity.test.ts`);
if (tests.length > 1) fail(`More than one ${kebab}.entity.test.ts: ${tests.map(rel).join(", ")}`);
const testFile = tests[0];
const entity = read(entityFile);
const test = read(testFile);

for (const [label, source] of [[rel(entityFile), entity], [rel(testFile), test]]) {
  const marker = TODO_MARKERS.find((m) => source.includes(m));
  if (marker) fail(`${label} still contains "${marker}"`);
}

const stateMatch = entity.match(new RegExp(`export interface ${pascal}State extends EntityState \\{([\\s\\S]*?)\\n\\}`));
if (!stateMatch) fail(`${rel(entityFile)} must declare: export interface ${pascal}State extends EntityState`);
const fields = [...stateMatch[1].matchAll(/^\s*([a-z][A-Za-z0-9]*)\??\s*:/gm)].map((m) => m[1]);
if (fields.length === 0) fail(`${pascal}State has no fields`);

if (!entity.includes(`export class ${pascal} extends Entity<${pascal}State> {`)) {
  fail(`${rel(entityFile)} must declare: export class ${pascal} extends Entity<${pascal}State>`);
}
const ctor = entity.match(/constructor\(props: (\w+)\)\s*\{([\s\S]*?)\n  \}/);
if (!ctor || ctor[1] !== `${pascal}State`) fail(`constructor must be: constructor(props: ${pascal}State)`);
if (ctor[2].trim() !== "super(props);") {
  fail("constructor must only call super(props): validation is lazy, never call validate() or transform data there");
}
for (const field of fields) {
  if (!new RegExp(`\\n  get ${field}\\(\\): [^{]+\\{\\s*return this\\.props\\.${field};\\s*\\}`).test(entity)) {
    fail(`missing getter: get ${field}(): <type> { return this.props.${field}; }`);
  }
}
const validateMatch = entity.match(/\n  validate\(\): void \{([\s\S]*?)\n  \}/);
if (!validateMatch) fail("missing validate(): void");
if (!validateMatch[1].includes("Validator.validate([")) fail("validate() must use Validator.validate([...])");
for (const field of fields) {
  if (!validateMatch[1].includes(`code: "${camel}.${field}"`)) {
    fail(`validate() has no entry with code "${camel}.${field}" (every field must be validated)`);
  }
}
if (/rules:\s*\[\s*\]/.test(validateMatch[1])) fail("validate() has a field with an empty rules list");

const importMatch = test.match(new RegExp(`import \\{[^}]*\\b${pascal}\\b[^}]*\\} from "([^"]+)";`));
if (!importMatch) fail(`${rel(testFile)} must import ${pascal} from the module src/index`);
const importTarget = path.resolve(path.dirname(testFile), importMatch[1]);
if (importTarget !== path.join(srcDir, "index") && importTarget !== srcDir) {
  fail(`${rel(testFile)} must import ${pascal} from the module src/index (found "${importMatch[1]}")`);
}
if (!/\.validate\(\)/.test(test)) fail(`${rel(testFile)} never calls validate()`);
if (!/test\(\s*"[^"]*constructor[^"]*",[\s\S]*?\.not\.toThrow\(\)/.test(test)) {
  fail(`${rel(testFile)} must assert that the constructor does not throw with invalid data (lazy validation)`);
}

const chain = [[path.join(srcDir, aggregatePath, "model", "index.ts"), `./${kebab}.entity`]];
const segments = aggregatePath.split("/");
chain.push([path.join(srcDir, aggregatePath, "index.ts"), "./model"]);
for (let i = segments.length - 1; i >= 0; i -= 1) {
  chain.push([path.join(srcDir, ...segments.slice(0, i), "index.ts"), `./${segments[i]}`]);
}
for (const [indexFile, target] of chain) {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!fs.existsSync(indexFile) || !new RegExp(`^export \\* from ["']${escaped}(/index)?["'];?\\s*$`, "m").test(read(indexFile))) {
    fail(`${rel(indexFile)} is missing: export * from "${target}";`);
  }
}
ok(`structure, lazy constructor, ${fields.length} getters, validate() entries and exports`);

// 2. Type check --------------------------------------------------------------
step(2, "Type check");
run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], moduleDir);
ok("tsc --noEmit");

// 3. Entity coverage ---------------------------------------------------------
step(3, `Coverage of ${rel(entityFile)} (100% required)`);
run(
  "npx",
  [
    "jest",
    "--coverage",
    `--collectCoverageFrom=${rel(entityFile)}`,
    `--coverageThreshold=${FULL_COVERAGE}`,
    "--coverageReporters=text",
    "--coverageDirectory=coverage/module-entity",
    "--runTestsByPath",
    rel(testFile),
  ],
  moduleDir,
);
ok("100% statements, branches, functions and lines");

// 4. Full suite --------------------------------------------------------------
step(4, `Full ${args.module} test suite`);
run("npx", ["jest", "--coverage"], moduleDir);
ok(`all ${args.module} tests passed`);

console.log(`\n\x1b[32m✔ ${pascal} (${rel(entityFile)}) verified\x1b[0m`);
