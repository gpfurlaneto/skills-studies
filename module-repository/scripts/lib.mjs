// Shared helpers of the module-repository scripts: argument parsing, name normalization and
// resolution of every path the skill reads or writes. Nothing outside the skill folder is read
// except the target module itself.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES_DIR = path.join(SKILL_DIR, "assets", "templates");
export const MARKER = "TODO(module-repository)";
export const REPOSITORY_TYPES = ["crud", "custom"];
export const INPUT_MODES = ["entity", "data"];
// Canonical order, the same one used by CrudRepository in the shared package.
export const SHARED_METHODS = ["create", "update", "delete", "findById", "findPage"];
export const SHARED_CONTRACTS = {
  create: "CreateRepository",
  update: "UpdateRepository",
  delete: "DeleteRepository",
  findById: "FindByIdRepository",
  findPage: "FindPageRepository",
};

const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PASCAL_RE = /^[A-Z][A-Za-z0-9]*$/;
const RESERVED = new Set(["index", "src", "test", "dist", "model", "provider", "usecase"]);

export function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

export function ok(msg) {
  console.log(`\x1b[32m  ✔ ${msg}\x1b[0m`);
}

export function toWords(raw) {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

export function toKebab(raw) {
  return toWords(raw).join("-");
}

export function toPascal(raw) {
  return toWords(raw)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}

export function toCamel(raw) {
  const pascal = toPascal(raw);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

export function pluralize(word) {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

export function rel(cwd, file) {
  return path.relative(cwd, file).split(path.sep).join("/");
}

// Relative import specifier between two files/dirs, always starting with "./" or "../",
// without the ".ts" extension.
export function importPath(fromDir, toFile) {
  let spec = path.relative(fromDir, toFile).split(path.sep).join("/").replace(/\.ts$/, "");
  if (!spec.startsWith(".")) spec = `./${spec}`;
  return spec;
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`Could not read ${file}: ${error.message}`);
  }
}

export function listTsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files.sort();
}

export function render(templatePath, vars) {
  const source = fs.readFileSync(path.join(TEMPLATES_DIR, templatePath), "utf8");
  return source.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vars)) fail(`Unknown placeholder ${match} in ${templatePath}`);
    return vars[key];
  });
}

// The shared package is the dependency named "<scope>/shared" in the module package.json.
export function resolveSharedPackage(moduleDir, cwd) {
  const pkgPath = path.join(moduleDir, "package.json");
  if (!fs.existsSync(pkgPath)) fail(`Missing ${rel(cwd, pkgPath)}`);
  const pkg = readJson(pkgPath);
  const deps = { ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies };
  const shared = Object.keys(deps).filter((name) => name === "shared" || name.endsWith("/shared"));
  if (shared.length !== 1) {
    fail(`Expected exactly one "<scope>/shared" dependency in ${rel(cwd, pkgPath)}, found ${shared.length}.`);
  }
  return shared[0];
}

export function resolveModule(cwd, moduleName) {
  if (!moduleName) fail("Missing --module <module>");
  if (!KEBAB_RE.test(moduleName)) fail(`Invalid module name "${moduleName}". Use the folder name in modules/.`);
  const modulesDir = path.join(cwd, "modules");
  const moduleDir = path.join(modulesDir, moduleName);
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    const available = fs.existsSync(modulesDir)
      ? fs.readdirSync(modulesDir).filter((name) => !name.startsWith("."))
      : [];
    fail(`Module "${moduleName}" does not exist in modules/. Available: ${available.join(", ") || "none"}`);
  }
  const srcDir = path.join(moduleDir, "src");
  const srcIndex = path.join(srcDir, "index.ts");
  if (!fs.existsSync(srcIndex)) fail(`Missing ${rel(cwd, srcIndex)}`);
  return { moduleDir, srcDir, srcIndex, testDir: path.join(moduleDir, "test") };
}

// Destination of the repository interface.
//   convention: modules/<module>/src/<aggregate>/provider/<aggregate>.repository.ts
//   explicit:   any modules/<module>/src/**/provider/<name>.repository.ts
export function resolveRepositoryTarget(cwd, mod, { aggregate, path: explicitPath }) {
  if (aggregate && explicitPath) fail("Use either --aggregate or --path, not both.");
  if (!aggregate && !explicitPath) fail("Missing --aggregate <name> or --path <repository file>");

  if (aggregate) {
    const kebab = toKebab(aggregate);
    if (!KEBAB_RE.test(kebab)) fail(`Invalid aggregate name "${aggregate}".`);
    if (RESERVED.has(kebab)) fail(`"${kebab}" is a reserved folder name and cannot be used as an aggregate.`);
    const aggregateDir = path.join(mod.srcDir, kebab);
    if (!fs.existsSync(aggregateDir)) {
      const available = fs
        .readdirSync(mod.srcDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      fail(
        `Aggregate folder ${rel(cwd, aggregateDir)} does not exist. Available: ${available.join(", ") || "none"}. ` +
          "Create it first with the module-aggregate skill, or pass an explicit --path.",
      );
    }
    const providerDir = path.join(aggregateDir, "provider");
    return { kebab, aggregateDir, providerDir, file: path.join(providerDir, `${kebab}.repository.ts`) };
  }

  const file = path.resolve(cwd, explicitPath);
  const inSrc = path.relative(mod.srcDir, file);
  if (inSrc.startsWith("..") || path.isAbsolute(inSrc)) {
    fail(`--path must be inside ${rel(cwd, mod.srcDir)}/, got ${explicitPath}`);
  }
  const base = path.basename(file);
  const match = /^(.+)\.repository\.ts$/.exec(base);
  if (!match || !KEBAB_RE.test(match[1])) {
    fail(`--path must end with "<kebab-case-name>.repository.ts", got "${base}".`);
  }
  const providerDir = path.dirname(file);
  if (path.basename(providerDir) !== "provider") {
    fail(`The repository must live in a "provider" folder, got ${rel(cwd, providerDir)}/`);
  }
  const aggregateDir = path.dirname(providerDir);
  if (aggregateDir === mod.srcDir) fail("The provider folder must be inside an aggregate folder, not directly in src/.");
  if (!fs.existsSync(aggregateDir)) {
    fail(`Aggregate folder ${rel(cwd, aggregateDir)} does not exist. Create it first with the module-aggregate skill.`);
  }
  return { kebab: match[1], aggregateDir, providerDir, file };
}

// Every `export class <Name> extends Entity<...>` declared in the given files.
function findEntityClasses(files) {
  const found = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/export\s+class\s+([A-Z][A-Za-z0-9]*)\s+extends\s+Entity\s*</g)) {
      found.push({ name: match[1], file });
    }
  }
  return found;
}

export function resolveEntity(cwd, mod, target, entityArg) {
  if (entityArg) {
    const name = PASCAL_RE.test(entityArg) ? entityArg : toPascal(entityArg);
    const matches = findEntityClasses(listTsFiles(mod.srcDir)).filter((item) => item.name === name);
    if (matches.length === 0) {
      fail(`Entity class "${name}" (export class ${name} extends Entity<...>) was not found in ${rel(cwd, mod.srcDir)}/.`);
    }
    if (matches.length > 1) fail(`Entity class "${name}" is declared more than once in the module.`);
    return withState(cwd, matches[0]);
  }

  const modelDir = path.join(target.aggregateDir, "model");
  const candidates = findEntityClasses(listTsFiles(modelDir));
  if (candidates.length !== 1) {
    fail(
      `Could not infer the entity: ${rel(cwd, modelDir)}/ declares ${candidates.length} entity classes` +
        (candidates.length ? ` (${candidates.map((item) => item.name).join(", ")})` : "") +
        ". Pass --entity <Name>.",
    );
  }
  return withState(cwd, candidates[0]);
}

// Reads `<Entity>State` from the entity file. `fields` are the required own fields (base fields
// come from EntityState), used to build sample values in the generated test.
function withState(cwd, entity) {
  const source = fs.readFileSync(entity.file, "utf8");
  const stateName = `${entity.name}State`;
  const match = new RegExp(`export\\s+interface\\s+${stateName}\\s+extends\\s+EntityState\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!match) {
    fail(`"export interface ${stateName} extends EntityState { ... }" was not found in ${rel(cwd, entity.file)}.`);
  }
  const fields = [];
  for (const line of match[1].split("\n")) {
    const field = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?);?\s*$/.exec(line);
    if (field) fields.push({ name: field[1], type: field[2].trim() });
  }
  return { ...entity, stateName, fields };
}

// Import specifier of the entity from the provider folder: "../model" when the entity lives in
// the aggregate model folder (the project pattern), otherwise the relative file path.
export function entityImportFrom(target, entity) {
  const modelDir = path.join(target.aggregateDir, "model");
  if (path.dirname(entity.file) === modelDir && fs.existsSync(path.join(modelDir, "index.ts"))) {
    return importPath(target.providerDir, modelDir);
  }
  return importPath(target.providerDir, entity.file);
}

// Fake naming follows the module convention when there is one:
//   test/mock/*.repository.mock.ts -> <aggregate>.repository.mock.ts / <Entity>RepositoryMock
//   otherwise (default)            -> fake-<aggregate>.repository.ts / Fake<Entity>Repository
export function resolveFake(cwd, mod, target, entity, fakePathArg) {
  const mockDir = path.join(mod.testDir, "mock");
  let file;
  let style;

  if (fakePathArg) {
    file = path.resolve(cwd, fakePathArg);
    const inTest = path.relative(mod.testDir, file);
    if (inTest.startsWith("..") || path.isAbsolute(inTest)) fail(`--fake-path must be inside ${rel(cwd, mod.testDir)}/`);
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) fail("--fake-path must be a .ts file that is not a test.");
    style = /\.repository\.mock\.ts$/.test(file) ? "mock" : "fake";
  } else {
    const existing = fs.existsSync(mockDir) ? fs.readdirSync(mockDir) : [];
    const hasFake = existing.some((name) => /^fake-.+\.repository\.ts$/.test(name));
    const hasMock = existing.some((name) => /\.repository\.mock\.ts$/.test(name));
    style = hasMock && !hasFake ? "mock" : "fake";
    file = path.join(mockDir, style === "mock" ? `${target.kebab}.repository.mock.ts` : `fake-${target.kebab}.repository.ts`);
  }

  const className = style === "mock" ? `${entity.name}RepositoryMock` : `Fake${entity.name}Repository`;
  return {
    file,
    dir: path.dirname(file),
    className,
    style,
    testFile: file.replace(/\.ts$/, ".test.ts"),
    indexFile: path.join(path.dirname(file), "index.ts"),
  };
}

// `export * from "./<name>";` lines needed from `fromDir` up to the module src folder.
export function exportChain(fromDir, srcDir) {
  const chain = [];
  let dir = fromDir;
  while (dir !== srcDir) {
    const parent = path.dirname(dir);
    chain.push({ indexFile: path.join(parent, "index.ts"), spec: `./${path.basename(dir)}` });
    dir = parent;
  }
  return chain;
}

export function hasExport(source, spec) {
  const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^export\\s+\\*\\s+from\\s+["']${escaped}(/index)?["'];?\\s*$`, "m").test(source);
}

// Inserts the export right after the last `export ... from "..."` line, keeping every other line.
export function addExport(source, spec) {
  if (hasExport(source, spec)) return { changed: false, content: source };
  const exportLine = `export * from "${spec}";`;
  const lines = source.split("\n");
  let last = -1;
  lines.forEach((line, index) => {
    if (/^export\s+(\*|\{[^}]*\})\s+from\s+["'][^"']+["'];?\s*$/.test(line)) last = index;
  });
  if (last >= 0) {
    lines.splice(last + 1, 0, exportLine);
    return { changed: true, content: lines.join("\n") };
  }
  if (source.trim() === "") return { changed: true, content: `${exportLine}\n` };
  return { changed: true, content: `${exportLine}\n\n${source}` };
}
