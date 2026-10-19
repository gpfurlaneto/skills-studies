#!/usr/bin/env node
// Deterministic scaffold of an aggregate inside an existing business module.
//
// From the inputs alone (same inputs -> same files) it creates:
//   modules/<module>/src/<aggregate>/index.ts
//   modules/<module>/src/<aggregate>/model/index.ts
//   modules/<module>/src/<aggregate>/model/<aggregate>.entity.ts
//   modules/<module>/src/<aggregate>/provider/index.ts
//   modules/<module>/src/<aggregate>/provider/<aggregate>.repository.ts
//   modules/<module>/src/<aggregate>/usecase/index.ts
//   modules/<module>/src/<aggregate>/usecase/*.usecase.ts   (crud: 5 files, example: 1 file)
// and adds `export * from "./<aggregate>";` to modules/<module>/src/index.ts.
//
// Every file comes from ../assets/templates. Nothing outside this skill folder is read
// except the target module itself.
//
// Usage:
//   node scaffold-aggregate.mjs --module <module> --aggregate <name> --usecases <crud|example>
//                               [--cwd <monorepo root>] [--dry-run]
//
//   --module     folder name of an existing module in modules/, e.g. "auth"
//   --aggregate  aggregate name in any casing: "order-item", "OrderItem", "order_item", "order item"
//   --usecases   crud: create/update/delete/find-by-id/find-page skeletons
//                example: a single example use case
//   --cwd        monorepo root (default: current directory)
//   --dry-run    print the planned files without writing anything

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES_DIR = path.join(SKILL_DIR, "assets", "templates");
const USECASE_MODES = ["crud", "example"];
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const RESERVED = new Set(["index", "src", "test", "dist", "model", "provider", "usecase"]);

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { cwd: process.cwd(), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) fail(`Missing value for ${flag}`);
      i += 1;
      return value;
    };
    switch (flag) {
      case "--module": args.module = next(); break;
      case "--aggregate": args.aggregate = next(); break;
      case "--usecases": args.usecases = next(); break;
      case "--cwd": args.cwd = path.resolve(next()); break;
      case "--dry-run": args.dryRun = true; break;
      default: fail(`Unknown option: ${flag}`);
    }
  }
  if (!args.module) fail("Missing --module <module>");
  if (!args.aggregate) fail("Missing --aggregate <name>");
  if (!args.usecases) fail(`Missing --usecases <${USECASE_MODES.join("|")}>`);
  if (!USECASE_MODES.includes(args.usecases)) {
    fail(`Invalid --usecases "${args.usecases}". Use one of: ${USECASE_MODES.join(", ")}`);
  }
  return args;
}

function toWords(raw) {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function buildNames(raw) {
  const words = toWords(raw);
  const kebab = words.join("-");
  if (!KEBAB_RE.test(kebab)) {
    fail(`Invalid aggregate name "${raw}". It must start with a letter and contain only letters and digits.`);
  }
  if (RESERVED.has(kebab)) fail(`"${kebab}" is a reserved folder name and cannot be used as an aggregate.`);
  const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  const camel = pascal[0].toLowerCase() + pascal.slice(1);
  return { kebab, pascal, camel, code: camel };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Could not read ${file}: ${error.message}`);
  }
}

// The shared package is the dependency named "<scope>/shared" in the module package.json.
function resolveSharedPackage(modulePkg, modulePkgPath) {
  const deps = { ...modulePkg.peerDependencies, ...modulePkg.devDependencies, ...modulePkg.dependencies };
  const shared = Object.keys(deps).filter((name) => name === "shared" || name.endsWith("/shared"));
  if (shared.length !== 1) {
    fail(`Expected exactly one "<scope>/shared" dependency in ${modulePkgPath}, found ${shared.length}.`);
  }
  return shared[0];
}

function render(templatePath, vars) {
  const source = fs.readFileSync(path.join(TEMPLATES_DIR, templatePath), "utf8");
  const output = source.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vars)) fail(`Unknown placeholder ${match} in ${templatePath}`);
    return vars[key];
  });
  return output;
}

function planFiles(mode, names) {
  const { kebab } = names;
  const files = [
    ["index.ts.tpl", "index.ts"],
    ["model/index.ts.tpl", "model/index.ts"],
    ["model/entity.ts.tpl", `model/${kebab}.entity.ts`],
    ["provider/index.ts.tpl", "provider/index.ts"],
    ["provider/repository.ts.tpl", `provider/${kebab}.repository.ts`],
  ];
  if (mode === "crud") {
    files.push(
      ["usecase/crud/index.ts.tpl", "usecase/index.ts"],
      ["usecase/crud/create.usecase.ts.tpl", `usecase/create-${kebab}.usecase.ts`],
      ["usecase/crud/update.usecase.ts.tpl", `usecase/update-${kebab}.usecase.ts`],
      ["usecase/crud/delete.usecase.ts.tpl", `usecase/delete-${kebab}.usecase.ts`],
      ["usecase/crud/find-by-id.usecase.ts.tpl", `usecase/find-${kebab}-by-id.usecase.ts`],
      ["usecase/crud/find-page.usecase.ts.tpl", `usecase/find-${kebab}-page.usecase.ts`],
    );
  } else {
    files.push(
      ["usecase/example/index.ts.tpl", "usecase/index.ts"],
      ["usecase/example/example.usecase.ts.tpl", `usecase/example-${kebab}.usecase.ts`],
    );
  }
  return files;
}

// Inserts the aggregate export right after the last `export ... from "..."` line, keeping
// every existing line. If the file has no re-exports yet, the export goes on top.
function updateModuleIndex(source, kebab) {
  const exportLine = `export * from "./${kebab}";`;
  const alreadyExported = new RegExp(`^export \\* from ["']\\./${kebab}(/index)?["'];?\\s*$`, "m");
  if (alreadyExported.test(source)) return { changed: false, content: source };

  const lines = source.split("\n");
  let lastReExport = -1;
  lines.forEach((line, index) => {
    if (/^export\s+(\*|\{[^}]*\})\s+from\s+["'][^"']+["'];?\s*$/.test(line)) lastReExport = index;
  });

  if (lastReExport >= 0) {
    lines.splice(lastReExport + 1, 0, exportLine);
    return { changed: true, content: lines.join("\n") };
  }
  const rest = source.trim() === "" ? "" : `\n${source}`;
  return { changed: true, content: `${exportLine}\n${rest}` };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!KEBAB_RE.test(args.module)) fail(`Invalid module name "${args.module}". Use the folder name in modules/.`);
  const moduleDir = path.join(args.cwd, "modules", args.module);
  const modulePkgPath = path.join(moduleDir, "package.json");
  const moduleSrc = path.join(moduleDir, "src");
  const moduleIndex = path.join(moduleSrc, "index.ts");

  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    const available = fs.existsSync(path.join(args.cwd, "modules"))
      ? fs.readdirSync(path.join(args.cwd, "modules")).filter((name) => !name.startsWith("."))
      : [];
    fail(`Module "${args.module}" does not exist in modules/. Available: ${available.join(", ") || "none"}`);
  }
  if (!fs.existsSync(modulePkgPath)) fail(`Missing ${path.relative(args.cwd, modulePkgPath)}`);
  if (!fs.existsSync(moduleIndex)) fail(`Missing ${path.relative(args.cwd, moduleIndex)}`);

  const names = buildNames(args.aggregate);
  const aggregateDir = path.join(moduleSrc, names.kebab);
  if (fs.existsSync(aggregateDir)) {
    fail(`${path.relative(args.cwd, aggregateDir)} already exists. Nothing was changed.`);
  }

  const sharedPackage = resolveSharedPackage(readJson(modulePkgPath), path.relative(args.cwd, modulePkgPath));
  const vars = { ...names, sharedPackage };

  const outputs = planFiles(args.usecases, names).map(([template, target]) => ({
    target: path.join(aggregateDir, target),
    content: render(template, vars),
  }));
  const indexUpdate = updateModuleIndex(fs.readFileSync(moduleIndex, "utf8"), names.kebab);

  const rel = (file) => path.relative(args.cwd, file);
  console.log(`Module:    ${args.module}`);
  console.log(`Aggregate: ${names.kebab} (${names.pascal})`);
  console.log(`Use cases: ${args.usecases}`);
  console.log(`Shared:    ${sharedPackage}`);
  console.log("");

  if (args.dryRun) {
    for (const { target, content } of outputs) console.log(`--- ${rel(target)}\n${content}`);
    if (indexUpdate.changed) console.log(`--- ${rel(moduleIndex)} (updated)\n${indexUpdate.content}`);
    console.log("\nDry run: nothing was written.");
    return;
  }

  for (const { target, content } of outputs) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    console.log(`\x1b[32m+\x1b[0m ${rel(target)}`);
  }
  if (indexUpdate.changed) {
    fs.writeFileSync(moduleIndex, indexUpdate.content);
    console.log(`\x1b[33m~\x1b[0m ${rel(moduleIndex)}`);
  } else {
    console.log(`= ${rel(moduleIndex)} (already exports ./${names.kebab})`);
  }
  console.log(`\nNext: npx tsc --noEmit -p ${rel(path.join(moduleDir, "tsconfig.json"))}`);
}

main();
