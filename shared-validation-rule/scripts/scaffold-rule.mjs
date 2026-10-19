#!/usr/bin/env node
// Deterministic scaffold of a new validation rule in packages/shared.
//
// Creates, from the inputs alone (same inputs -> same files):
//   packages/shared/src/validation/rules/<rule-name>.rule.ts
//   packages/shared/test/validation/rules/<rule-name>.rule.test.ts
// and appends `export * from "./<rule-name>.rule";` to rules/index.ts.
//
// The rule skeleton already has the final shape (imports, class, constructor, empty handling,
// type guard through the right rule.utils helper). Only the validation logic and the
// valid/invalid test cases are left as TODO(shared-validation-rule) markers. verify-rule.mjs
// refuses to pass while any marker remains.
//
// Usage:
//   node scaffold-rule.mjs --name <rule-name> --code <error.code> --type <string|number|date|array|mixed>
//                          [--param <name>:<type>[=<default>]]... [--empty <ignore|reject>]
//                          [--cwd <monorepo root>] [--dry-run]
//
//   --name    rule name in any casing: "has-emoji", "HasEmoji", "HasEmojiRule", "has emoji"
//   --code    error suffix returned on failure, dot-case: "has.emoji"
//   --type    main value type validated by the rule
//   --param   constructor parameter, repeatable and kept in the given order.
//             Examples: "min:number", "minLength:number=8", "values:readonly string[]"
//   --empty   ignore (default): empty values return null and RequiredRule handles required fields.
//             reject: empty values return the error code.
//   --dry-run print the files without writing anything

import fs from "node:fs";
import path from "node:path";

const SHARED_DIR = "packages/shared";
const RULES_DIR = "src/validation/rules";
const TESTS_DIR = "test/validation/rules";
const TYPES = ["string", "number", "date", "array", "mixed"];
const EMPTY_MODES = ["ignore", "reject"];
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const CODE_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
const PARAM_RE = /^([a-zA-Z_$][\w$]*):([^=]+?)(?:=(.+))?$/;
const TODO = "TODO(shared-validation-rule)";

const HELPER_BY_TYPE = {
  string: "validateStringValues",
  number: "validateNumberValues",
  date: "validateDateValues",
  mixed: "validateEachValue",
};

// Invalid-type samples per value type. With the helpers above these are rejected before the
// predicate runs, so the generated type test passes as soon as the rule compiles.
const INVALID_TYPE_SAMPLES = {
  string: ["123", "{}"],
  number: ['"5"', "Number.NaN"],
  date: ['"not-a-date"', "{}"],
  array: ['"abc"', "10"],
};

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { params: [], empty: "ignore", cwd: process.cwd(), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) fail(`Missing value for ${flag}`);
      i += 1;
      return value;
    };
    switch (flag) {
      case "--name": args.name = next(); break;
      case "--code": args.code = next(); break;
      case "--type": args.type = next(); break;
      case "--param": args.params.push(next()); break;
      case "--empty": args.empty = next(); break;
      case "--cwd": args.cwd = path.resolve(next()); break;
      case "--dry-run": args.dryRun = true; break;
      default: fail(`Unknown option: ${flag}`);
    }
  }
  return args;
}

function toKebab(raw) {
  return raw
    .trim()
    .replace(/\.rule(\.ts)?$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/-rule$/, "");
}

function toPascal(kebab) {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function parseParam(raw) {
  const match = PARAM_RE.exec(raw.trim());
  if (!match) fail(`Invalid --param "${raw}". Use <name>:<type>[=<default>], e.g. "min:number"`);
  const [, name, type, defaultValue] = match;
  return { name, type: type.trim(), defaultValue: defaultValue?.trim() };
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function renderConstructor(params) {
  if (params.length === 0) return null;
  const render = (p) => `readonly ${p.name}: ${p.type}${p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ""}`;
  if (params.length === 1) return `  constructor(${render(params[0])}) {}`;
  return ["  constructor(", ...params.map((p) => `    ${render(p)},`), "  ) {}"].join("\n");
}

function renderRule({ className, code, type, empty, params }) {
  const utils = new Set();
  const body = [];
  const helper = HELPER_BY_TYPE[type];

  if (empty === "reject") {
    utils.add("isEmptyValue");
    body.push(
      "    if (isEmptyValue(value)) {",
      `      return "${code}";`,
      "    }",
      "",
    );
  }

  if (type === "array") {
    if (empty === "ignore") {
      utils.add("isEmptyValue");
      body.push(
        "    if (isEmptyValue(value)) {",
        "      return null;",
        "    }",
        "",
      );
    }
    body.push(
      "    if (!Array.isArray(value)) {",
      `      return "${code}";`,
      "    }",
      "",
      `    throw new Error("${TODO}: return null when the array is valid, otherwise \\"${code}\\"");`,
    );
  } else {
    utils.add(helper);
    body.push(
      `    return ${helper}(value, "${code}", (item) => {`,
      `      throw new Error("${TODO}: return true when item is valid");`,
      "    });",
    );
  }

  const ctor = renderConstructor(params);
  return [
    `import { ${[...utils].sort().join(", ")} } from "../rule.utils";`,
    'import { ValidationRule } from "../validation-rule.interface";',
    "",
    `export class ${className} implements ValidationRule {`,
    ...(ctor ? [ctor, ""] : []),
    "  validate(value: unknown): string | null {",
    ...body,
    "  }",
    "}",
    "",
  ].join("\n");
}

function renderTest({ className, code, type, empty, params }) {
  const needsArgs = params.some((p) => p.defaultValue === undefined);
  const newRule = needsArgs
    ? `new ${className}(/* ${TODO}: ${params.map((p) => p.name).join(", ")} */)`
    : `new ${className}()`;
  const emptyExpectation = empty === "ignore" ? "toBeNull()" : `toBe("${code}")`;
  const emptyTitle = empty === "ignore"
    ? "should ignore empty values to allow optional field"
    : "should reject empty values";

  const blocks = [
    [
      "  test(\"should accept valid values\", () => {",
      `    const rule = ${newRule};`,
      "",
      `    // ${TODO}: valid values, including the boundary values that must still pass`,
      "  });",
    ],
    [
      "  test(\"should reject invalid values\", () => {",
      `    const rule = ${newRule};`,
      "",
      `    // ${TODO}: invalid values, including the first values past each boundary`,
      "  });",
    ],
  ];

  if (INVALID_TYPE_SAMPLES[type]) {
    blocks.push([
      "  test(\"should reject invalid types\", () => {",
      `    const rule = ${newRule};`,
      "",
      ...INVALID_TYPE_SAMPLES[type].map((sample) => `    expect(rule.validate(${sample})).toBe("${code}");`),
      "  });",
    ]);
  }

  blocks.push([
    `  test("${emptyTitle}", () => {`,
    `    const rule = ${newRule};`,
    "",
    ...(type === "array" ? ["[]"] : ['""', '"   "', "[]"]).map(
      (sample) => `    expect(rule.validate(${sample})).${emptyExpectation};`,
    ),
    `    expect(rule.validate(null)).${emptyExpectation};`,
    `    expect(rule.validate(undefined)).${emptyExpectation};`,
    "  });",
  ]);

  if (params.length > 0) {
    blocks.push([
      "  test(\"should respect the constructor parameters\", () => {",
      `    // ${TODO}: build the rule with different parameter values (and the default values, if any)`,
      "    // and show how each parameter changes the result.",
      "  });",
    ]);
  }

  return [
    `import { ${className} } from "../../../src/index";`,
    "",
    `describe("${className}", () => {`,
    blocks.map((block) => block.join("\n")).join("\n\n"),
    "});",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

if (!args.name) fail("Missing --name (rule name)");
if (!args.code) fail("Missing --code (error code returned on failure)");
if (!args.type) fail(`Missing --type (${TYPES.join(" | ")})`);
if (!TYPES.includes(args.type)) fail(`Invalid --type "${args.type}". Use one of: ${TYPES.join(", ")}`);
if (!EMPTY_MODES.includes(args.empty)) fail(`Invalid --empty "${args.empty}". Use one of: ${EMPTY_MODES.join(", ")}`);
if (!CODE_RE.test(args.code)) fail(`Invalid --code "${args.code}". Use dot-case, e.g. "min.length"`);

const ruleName = toKebab(args.name);
if (!KEBAB_RE.test(ruleName)) fail(`Could not derive a kebab-case name from "${args.name}" (got "${ruleName}")`);
const className = `${toPascal(ruleName)}Rule`;
const params = args.params.map(parseParam);
const paramNames = params.map((p) => p.name);
if (new Set(paramNames).size !== paramNames.length) fail("Duplicate --param names");
const firstDefault = params.findIndex((p) => p.defaultValue !== undefined);
if (firstDefault !== -1 && params.slice(firstDefault).some((p) => p.defaultValue === undefined)) {
  fail("A parameter without a default cannot come after a parameter with a default");
}

const sharedDir = path.join(args.cwd, SHARED_DIR);
const rulesDir = path.join(sharedDir, RULES_DIR);
const testsDir = path.join(sharedDir, TESTS_DIR);
const rulesIndex = path.join(rulesDir, "index.ts");
const validationIndex = path.join(sharedDir, "src/validation/index.ts");
const rootIndex = path.join(sharedDir, "src/index.ts");
const ruleFile = path.join(rulesDir, `${ruleName}.rule.ts`);
const testFile = path.join(testsDir, `${ruleName}.rule.test.ts`);

// Preflight: nothing is written if any check fails.
for (const file of [
  path.join(sharedDir, "package.json"),
  path.join(sharedDir, "src/validation/validation-rule.interface.ts"),
  path.join(sharedDir, "src/validation/rule.utils.ts"),
  rulesIndex,
  validationIndex,
  rootIndex,
]) {
  if (!fs.existsSync(file)) fail(`Missing ${path.relative(args.cwd, file)}. Run from the monorepo root or pass --cwd.`);
}
if (fs.existsSync(ruleFile)) fail(`${path.relative(args.cwd, ruleFile)} already exists`);
if (fs.existsSync(testFile)) fail(`${path.relative(args.cwd, testFile)} already exists`);

const existingRules = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".rule.ts"));
for (const file of existingRules) {
  const source = fs.readFileSync(path.join(rulesDir, file), "utf8");
  if (new RegExp(`export class ${className}\\b`).test(source)) {
    fail(`Class ${className} already exists in ${RULES_DIR}/${file}`);
  }
  // Ignore type comparisons such as `typeof value === "string"`.
  if (new RegExp(`(?<![=!]==\\s*)"${args.code.replace(/\./g, "\\.")}"`).test(source)) {
    fail(`Error code "${args.code}" is already returned by ${RULES_DIR}/${file}. Pick a distinct code, or reuse that rule.`);
  }
}

const ruleSource = renderRule({ className, code: args.code, type: args.type, empty: args.empty, params });
const testSource = renderTest({ className, code: args.code, type: args.type, empty: args.empty, params });
const exportLine = `export * from "./${ruleName}.rule";`;

if (args.dryRun) {
  console.log(`--- ${path.relative(args.cwd, ruleFile)}\n${ruleSource}`);
  console.log(`--- ${path.relative(args.cwd, testFile)}\n${testSource}`);
  console.log(`--- ${path.relative(args.cwd, rulesIndex)} (append)\n${exportLine}`);
  process.exit(0);
}

fs.mkdirSync(testsDir, { recursive: true });
fs.writeFileSync(ruleFile, ruleSource);
fs.writeFileSync(testFile, testSource);

const updated = [];
function ensureLine(file, line) {
  const content = fs.readFileSync(file, "utf8");
  if (content.split("\n").some((l) => l.trim() === line)) return;
  fs.writeFileSync(file, `${content.replace(/\n*$/, "\n")}${line}\n`);
  updated.push(path.relative(args.cwd, file));
}
ensureLine(rulesIndex, exportLine);
ensureLine(validationIndex, 'export * from "./rules";');
ensureLine(rootIndex, 'export * from "./validation";');

console.log("\x1b[32m✔ Rule scaffolded\x1b[0m");
console.log(`  Class:      ${className}`);
console.log(`  Error code: ${args.code}`);
console.log(`  Type:       ${args.type} (empty values: ${args.empty})`);
console.log(`  Params:     ${params.length ? params.map((p) => `${p.name}: ${p.type}${p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ""}`).join(", ") : "none"}`);
console.log(`  Created:    ${path.relative(args.cwd, ruleFile)}`);
console.log(`              ${path.relative(args.cwd, testFile)}`);
console.log(`  Updated:    ${updated.join(", ") || "none"}`);
console.log(`\nNext: replace every ${TODO} marker, then run verify-rule.mjs --name ${ruleName}`);
