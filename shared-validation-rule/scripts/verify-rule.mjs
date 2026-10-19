#!/usr/bin/env node
// Verifies a validation rule in packages/shared against the project pattern.
//
// Steps (any failure aborts with a non-zero exit code):
//   1. Static checks: files exist, export is present, no TODO(shared-validation-rule) markers,
//      class implements ValidationRule with `validate(value: unknown): string | null`,
//      no `throw` in the rule, test imports from "../../../src/index"
//   2. Type check: tsc --noEmit on packages/shared
//   3. Rule test with coverage limited to the rule file, 100% threshold on statements,
//      branches, functions and lines (with --utils: rule.utils.ts too, together with its test)
//   4. Full shared test suite (no regressions)
//
// Usage:
//   node verify-rule.mjs --name <rule-name> [--utils] [--cwd <monorepo root>]
//
//   --utils  rule.utils.ts was changed: also require 100% coverage for it and run its test

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SHARED_DIR = "packages/shared";
const TODO = "TODO(shared-validation-rule)";
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

const args = { cwd: process.cwd(), utils: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--name") args.name = argv[++i];
  else if (argv[i] === "--cwd") args.cwd = path.resolve(argv[++i]);
  else if (argv[i] === "--utils") args.utils = true;
  else fail(`Unknown option: ${argv[i]}`);
}
if (!args.name) fail("Missing --name (kebab-case rule name)");

const ruleName = args.name.replace(/\.rule(\.ts)?$/, "");
const sharedDir = path.join(args.cwd, SHARED_DIR);
const ruleRel = `src/validation/rules/${ruleName}.rule.ts`;
const testRel = `test/validation/rules/${ruleName}.rule.test.ts`;
const ruleFile = path.join(sharedDir, ruleRel);
const testFile = path.join(sharedDir, testRel);
const read = (file) => fs.readFileSync(file, "utf8");

// 1. Static checks -----------------------------------------------------------
step(1, "Static checks");
if (!fs.existsSync(ruleFile)) fail(`Missing ${SHARED_DIR}/${ruleRel}`);
if (!fs.existsSync(testFile)) fail(`Missing ${SHARED_DIR}/${testRel}`);

const rule = read(ruleFile);
const test = read(testFile);

for (const [label, source] of [[ruleRel, rule], [testRel, test]]) {
  if (source.includes(TODO)) fail(`${label} still contains ${TODO} markers`);
}
if (!/export class [A-Z][A-Za-z0-9]*Rule implements ValidationRule\b/.test(rule)) {
  fail(`${ruleRel} must export a class named <PascalCase>Rule that implements ValidationRule`);
}
if (!rule.includes('import { ValidationRule } from "../validation-rule.interface";')) {
  fail(`${ruleRel} must import ValidationRule from "../validation-rule.interface"`);
}
if (!rule.includes("validate(value: unknown): string | null")) {
  fail(`${ruleRel} must declare validate(value: unknown): string | null`);
}
if (/\bthrow\b/.test(rule)) fail(`${ruleRel} must not throw: return an error code instead`);
if (!test.includes('from "../../../src/index"')) {
  fail(`${testRel} must import the rule from "../../../src/index"`);
}
const exportLine = `export * from "./${ruleName}.rule";`;
if (!read(path.join(sharedDir, "src/validation/rules/index.ts")).split("\n").some((l) => l.trim() === exportLine)) {
  fail(`src/validation/rules/index.ts is missing: ${exportLine}`);
}
if (!read(path.join(sharedDir, "src/validation/index.ts")).includes('export * from "./rules";')) {
  fail('src/validation/index.ts is missing: export * from "./rules";');
}
if (!read(path.join(sharedDir, "src/index.ts")).includes('export * from "./validation";')) {
  fail('src/index.ts is missing: export * from "./validation";');
}
ok("structure, markers and exports");

// 2. Type check --------------------------------------------------------------
step(2, "Type check");
run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"], sharedDir);
ok("tsc --noEmit");

// 3. Rule coverage -----------------------------------------------------------
step(3, `Coverage of ${ruleRel}${args.utils ? " and rule.utils.ts" : ""} (100% required)`);
const coverageFrom = [ruleRel, ...(args.utils ? ["src/validation/rule.utils.ts"] : [])];
const testPaths = [testRel, ...(args.utils ? ["test/validation/rule.utils.test.ts"] : [])];
run(
  "npx",
  [
    "jest",
    "--coverage",
    ...coverageFrom.map((file) => `--collectCoverageFrom=${file}`),
    `--coverageThreshold=${FULL_COVERAGE}`,
    "--coverageReporters=text",
    "--coverageDirectory=coverage/shared-validation-rule",
    "--runTestsByPath",
    ...testPaths,
  ],
  sharedDir,
);
ok("100% statements, branches, functions and lines");

// 4. Full suite --------------------------------------------------------------
step(4, "Full shared test suite");
run("npx", ["jest", "--coverage"], sharedDir);
ok("all shared tests passed");

console.log(`\n\x1b[32m✔ ${ruleName}.rule.ts verified\x1b[0m`);
