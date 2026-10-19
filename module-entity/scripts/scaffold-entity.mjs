#!/usr/bin/env node
// Scaffolds (or prepares the update of) a domain entity inside an existing module.
//
// What it does, deterministically:
//   1. Validates the module (modules/<module> with package.json and src/index.ts) and resolves
//      the "<scope>/shared" dependency used for imports.
//   2. Resolves the aggregate: by name (must exist in modules/<module>/src/<aggregate>) or by path
//      (--aggregate-path, used as the destination even if it does not exist yet).
//   3. Normalizes the entity name (kebab-case file, PascalCase class, camelCase error code prefix).
//   4. Parses the fields (--field "name:type", "name?:type" for optional fields).
//   5. Entity file  modules/<module>/src/<aggregate>/model/<entity>.entity.ts
//        - missing, or still the untouched module-aggregate placeholder -> written from the template
//        - existing real entity -> left untouched; the script prints the field diff (update mode)
//   6. Test file    modules/<module>/test/<aggregate>/model/<entity>.entity.test.ts
//        - an existing <entity>.entity.test.ts anywhere under test/ is reused (update mode)
//        - otherwise written from the template
//   7. Export chain: model/index.ts -> <aggregate>/index.ts -> src/index.ts (only appends lines).
//
// Generated files contain TODO(module-entity) markers where the rules and test values must be
// written. verify-entity.mjs fails while any marker is left.
//
// Usage:
//   node scaffold-entity.mjs --module <module> (--aggregate <name> | --aggregate-path <path>)
//     --entity <name> --field "<name>[?]:<type>" [--field ...] [--dry-run] [--cwd <monorepo root>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES_DIR = path.join(SKILL_DIR, "assets/templates");
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FIELD_NAME_RE = /^[a-z][A-Za-z0-9]*$/;
const BASE_FIELDS = new Set(["id", "createdAt", "updatedAt", "deletedAt"]);
const RESERVED = new Set(["index", "model", "provider", "usecase", "entity", "test"]);
const PLACEHOLDER_MARKER = "TODO: declare the";

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { cwd: process.cwd(), dryRun: false, fields: [] };
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
      case "--aggregate-path": args.aggregatePath = next(); break;
      case "--entity": args.entity = next(); break;
      case "--field": args.fields.push(next()); break;
      case "--cwd": args.cwd = path.resolve(next()); break;
      case "--dry-run": args.dryRun = true; break;
      default: fail(`Unknown option: ${flag}`);
    }
  }
  if (!args.module) fail("Missing --module <module>");
  if (!args.aggregate && !args.aggregatePath) fail("Missing --aggregate <name> or --aggregate-path <path>");
  if (args.aggregate && args.aggregatePath) fail("Use either --aggregate or --aggregate-path, not both");
  if (!args.entity) fail("Missing --entity <name>");
  if (args.fields.length === 0) fail('Missing --field "<name>[?]:<type>" (repeat it for each field)');
  return args;
}

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

function buildNames(raw, label) {
  const words = toWords(raw);
  const kebab = words.join("-");
  if (!KEBAB_RE.test(kebab)) {
    fail(`Invalid ${label} name "${raw}". It must start with a letter and contain only letters and digits.`);
  }
  if (RESERVED.has(kebab)) fail(`"${kebab}" is a reserved name and cannot be used as ${label}.`);
  const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  const camel = pascal[0].toLowerCase() + pascal.slice(1);
  return { kebab, pascal, camel };
}

function parseField(raw) {
  const separator = raw.indexOf(":");
  if (separator < 0) fail(`Invalid --field "${raw}". Use "<name>:<type>" or "<name>?:<type>".`);
  let name = raw.slice(0, separator).trim();
  const type = raw.slice(separator + 1).trim();
  const optional = name.endsWith("?");
  if (optional) name = name.slice(0, -1).trim();
  if (!FIELD_NAME_RE.test(name)) fail(`Invalid field name "${name}". Use camelCase.`);
  if (BASE_FIELDS.has(name)) fail(`"${name}" is already provided by EntityState. Do not declare it again.`);
  if (!type) fail(`Missing type for field "${name}".`);
  return { name, type, optional };
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

// Accepts "transaction", "src/transaction", "modules/<module>/src/transaction" or an absolute path.
// Returns the aggregate path relative to modules/<module>/src, in posix form.
function resolveAggregatePath(raw, srcDir, cwd) {
  const absolute = path.isAbsolute(raw)
    ? raw
    : raw.startsWith("modules/")
      ? path.join(cwd, raw)
      : path.join(srcDir, raw.replace(/^src\//, ""));
  const relative = path.relative(srcDir, absolute).split(path.sep).join("/").replace(/\/model\/?$/, "");
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`Aggregate path "${raw}" must be inside ${path.relative(cwd, srcDir)}.`);
  }
  for (const segment of relative.split("/")) {
    if (!KEBAB_RE.test(segment)) fail(`Aggregate path segment "${segment}" must be kebab-case.`);
    if (RESERVED.has(segment)) fail(`Aggregate path segment "${segment}" is a reserved name.`);
  }
  return relative;
}

function render(templateName, vars) {
  const source = fs.readFileSync(path.join(TEMPLATES_DIR, templateName), "utf8");
  return source.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vars)) fail(`Unknown placeholder ${match} in ${templateName}`);
    return vars[key];
  });
}

function getterType(field) {
  return field.optional ? `${field.type} | undefined` : field.type;
}

function buildEntityVars(names, fields, sharedPackage) {
  const stateFields = fields
    .map((field) => `  ${field.name}${field.optional ? "?" : ""}: ${field.type};`)
    .join("\n");
  const getters = fields
    .map((field) => [
      `  get ${field.name}(): ${getterType(field)} {`,
      `    return this.props.${field.name};`,
      "  }",
    ].join("\n"))
    .join("\n\n");
  const validationFields = fields
    .map((field) => [
      "      {",
      `        code: "${names.camel}.${field.name}",`,
      `        value: this.${field.name},`,
      `        rules: [], // TODO(module-entity): rules for ${field.name}: ${field.type}${field.optional ? " (optional)" : ""}`,
      "      },",
    ].join("\n"))
    .join("\n");
  return { ...names, sharedPackage, stateFields, getters, validationFields };
}

function buildTestVars(names, fields, sharedPackage, srcImport) {
  const validProps = fields
    .map((field) => `  ${field.name}: undefined as never, // TODO(module-entity): valid ${field.type}`)
    .join("\n");
  const getterAssertions = fields
    .map((field) => `    expect(${names.camel}.${field.name}).toBe(validProps.${field.name});`)
    .join("\n");
  return { ...names, sharedPackage, srcImport, validProps, getterAssertions };
}

// Fields declared in an existing `<Entity>State` interface (simple one-line declarations).
function readExistingFields(source, pascal) {
  const match = source.match(new RegExp(`interface\\s+${pascal}State[^{]*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) return null;
  return [...match[1].matchAll(/^\s*([a-z][A-Za-z0-9]*)(\??)\s*:\s*(.+?);?\s*$/gm)].map((m) => ({
    name: m[1],
    optional: m[2] === "?",
    type: m[3].replace(/;$/, "").trim(),
  }));
}

function findFiles(dir, fileName) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "coverage") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(full, fileName));
    else if (fileName === null ? entry.name.endsWith(".ts") : entry.name === fileName) found.push(full);
  }
  return found;
}

// Appends `exportLine` after the last `export ... from` line, unless an equivalent export exists.
function appendExport(source, target) {
  const exportLine = `export * from "${target}";`;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^export \\* from ["']${escaped}(/index)?["'];?\\s*$`, "m").test(source)) return null;
  const lines = source.split("\n");
  let last = -1;
  lines.forEach((line, index) => {
    if (/^export\s+(\*|\{[^}]*\})\s+from\s+["'][^"']+["'];?\s*$/.test(line)) last = index;
  });
  if (last >= 0) {
    lines.splice(last + 1, 0, exportLine);
    return lines.join("\n");
  }
  return source.trim() === "" ? `${exportLine}\n` : `${exportLine}\n${source}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rel = (file) => path.relative(args.cwd, file).split(path.sep).join("/");

  const modulesDir = path.join(args.cwd, "modules");
  const moduleDir = path.join(modulesDir, args.module);
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    const available = fs.existsSync(modulesDir)
      ? fs.readdirSync(modulesDir).filter((name) => fs.statSync(path.join(modulesDir, name)).isDirectory())
      : [];
    fail(`Module "${args.module}" not found in modules/. Available: ${available.join(", ") || "(none)"}`);
  }
  const modulePkgPath = path.join(moduleDir, "package.json");
  const srcDir = path.join(moduleDir, "src");
  const srcIndex = path.join(srcDir, "index.ts");
  if (!fs.existsSync(modulePkgPath)) fail(`Missing ${rel(modulePkgPath)}`);
  if (!fs.existsSync(srcIndex)) fail(`Missing ${rel(srcIndex)}`);
  const sharedPackage = resolveSharedPackage(readJson(modulePkgPath), rel(modulePkgPath));

  let aggregatePath;
  if (args.aggregate) {
    aggregatePath = buildNames(args.aggregate, "aggregate").kebab;
    if (!fs.existsSync(path.join(srcDir, aggregatePath))) {
      const available = fs.readdirSync(srcDir).filter((name) => fs.statSync(path.join(srcDir, name)).isDirectory());
      fail(
        `Aggregate "${aggregatePath}" not found in ${rel(srcDir)}. Available: ${available.join(", ") || "(none)"}. ` +
          "Create it with the module-aggregate skill or pass --aggregate-path to use a new path.",
      );
    }
  } else {
    aggregatePath = resolveAggregatePath(args.aggregatePath, srcDir, args.cwd);
  }

  const names = buildNames(args.entity, "entity");
  const fields = args.fields.map(parseField);
  const duplicated = fields.map((f) => f.name).filter((name, i, all) => all.indexOf(name) !== i);
  if (duplicated.length > 0) fail(`Duplicated fields: ${[...new Set(duplicated)].join(", ")}`);

  const aggregateDir = path.join(srcDir, aggregatePath);
  const modelDir = path.join(aggregateDir, "model");
  const entityFile = path.join(modelDir, `${names.kebab}.entity.ts`);
  const testFileName = `${names.kebab}.entity.test.ts`;
  const existingTests = findFiles(path.join(moduleDir, "test"), testFileName);
  const defaultTestFile = path.join(moduleDir, "test", aggregatePath, "model", testFileName);
  if (existingTests.length > 1) fail(`Found more than one ${testFileName}: ${existingTests.map(rel).join(", ")}`);
  const testFile = existingTests[0] ?? defaultTestFile;
  const srcImport = path
    .relative(path.dirname(defaultTestFile), srcIndex)
    .split(path.sep)
    .join("/")
    .replace(/\.ts$/, "");

  // Every aggregate is re-exported from src/index.ts, so names must be unique in the module.
  const declares = new RegExp(`export (class|interface|type) (${names.pascal}|${names.pascal}State)\\b`);
  const collisions = findFiles(srcDir, null).filter((file) => file !== entityFile && declares.test(fs.readFileSync(file, "utf8")));
  if (collisions.length > 0) {
    fail(`${names.pascal} or ${names.pascal}State is already declared in ${collisions.map(rel).join(", ")}. Choose another entity name.`);
  }

  const writes = [];
  const notes = [];

  // Entity --------------------------------------------------------------------
  let entityMode = "create";
  if (fs.existsSync(entityFile)) {
    const source = fs.readFileSync(entityFile, "utf8");
    if (source.includes(PLACEHOLDER_MARKER) && readExistingFields(source, names.pascal)?.length === 0) {
      entityMode = "replace-placeholder";
    } else {
      entityMode = "update";
      const existing = readExistingFields(source, names.pascal) ?? [];
      const existingNames = new Set(existing.map((f) => f.name));
      const requested = new Set(fields.map((f) => f.name));
      notes.push(
        `Entity exists: ${rel(entityFile)} (left untouched, edit it by hand following the pattern)`,
        `  existing fields:  ${existing.map((f) => `${f.name}${f.optional ? "?" : ""}: ${f.type}`).join(", ") || "(none)"}`,
        `  fields to add:    ${fields.filter((f) => !existingNames.has(f.name)).map((f) => `${f.name}${f.optional ? "?" : ""}: ${f.type}`).join(", ") || "(none)"}`,
        `  fields to review: ${fields.filter((f) => existingNames.has(f.name)).map((f) => f.name).join(", ") || "(none)"}`,
        `  not requested:    ${existing.filter((f) => !requested.has(f.name)).map((f) => f.name).join(", ") || "(none)"} (keep them unless the user asked to remove)`,
      );
    }
  }
  if (entityMode !== "update") {
    writes.push([entityFile, render("entity.ts.tpl", buildEntityVars(names, fields, sharedPackage))]);
  }

  // Test ----------------------------------------------------------------------
  const testMode = fs.existsSync(testFile) ? "update" : "create";
  if (testMode === "create") {
    writes.push([testFile, render("entity.test.ts.tpl", buildTestVars(names, fields, sharedPackage, srcImport))]);
  } else {
    notes.push(`Test exists: ${rel(testFile)} (left untouched, extend it by hand)`);
    if (testFile !== defaultTestFile) {
      notes.push(`  note: it is not in the default location ${rel(defaultTestFile)}; it was reused to avoid a duplicate`);
    }
  }

  // Export chain --------------------------------------------------------------
  const chain = [
    [path.join(modelDir, "index.ts"), `./${names.kebab}.entity`],
    [path.join(aggregateDir, "index.ts"), "./model"],
  ];
  // Nested aggregates (a/b) are exported from their parent folder index, up to src/index.ts.
  const segments = aggregatePath.split("/");
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const parentDir = path.join(srcDir, ...segments.slice(0, i));
    chain.push([path.join(parentDir, "index.ts"), `./${segments[i]}`]);
  }
  for (const [indexFile, target] of chain) {
    const pending = writes.find(([file]) => file === indexFile);
    const source = pending ? pending[1] : fs.existsSync(indexFile) ? fs.readFileSync(indexFile, "utf8") : "";
    const updated = appendExport(source, target);
    if (updated === null) continue;
    if (pending) pending[1] = updated;
    else writes.push([indexFile, updated]);
  }

  // Report --------------------------------------------------------------------
  console.log(`Module:     ${args.module} (${sharedPackage})`);
  console.log(`Aggregate:  ${aggregatePath}`);
  console.log(`Entity:     ${names.pascal} / ${names.pascal}State / file ${names.kebab}.entity.ts / code "${names.camel}.<field>"`);
  console.log(`Fields:     ${fields.map((f) => `${f.name}${f.optional ? "?" : ""}: ${f.type}`).join(", ")}`);
  console.log(`Entity:     ${entityMode} -> ${rel(entityFile)}`);
  console.log(`Test:       ${testMode} -> ${rel(testFile)}`);
  for (const note of notes) console.log(note);
  console.log(args.dryRun ? "\nDry run, would write:" : "\nWriting:");
  for (const [file] of writes) console.log(`  ${rel(file)}`);
  if (writes.length === 0) console.log("  (nothing)");
  if (args.dryRun) return;

  for (const [file, content] of writes) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`);
  }
  console.log("\n\x1b[32m✔ done. Replace every TODO(module-entity) marker, then run verify-entity.mjs\x1b[0m");
}

main();
