// Shared helpers of the module-use-case scripts: argument parsing, name normalization, resolution
// of every path the skill reads or writes, entity/dependency/fake discovery and export handling.
// Nothing outside the skill folder is read except the target module itself.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES_DIR = path.join(SKILL_DIR, "assets", "templates");
export const MARKER = "TODO(module-use-case)";
export const SCENARIOS = ["crud", "custom"];
export const CRUD_OPERATIONS = ["create", "update", "delete", "find-by-id", "find-page"];
export const MOCK_FRAMEWORKS =
  /\bjest\.(fn|mock|spyOn|createMockFromModule)\b|\bvi\.(fn|mock|spyOn)\b|from\s+["'](sinon|ts-mockito|jest-mock-extended|@golevelup\/ts-jest)["']/;
export const FORBIDDEN_IMPORTS =
  /from\s+["'](@nestjs\/[^"']*|@prisma\/[^"']*|prisma|express|fastify|axios|[^"']*\/apps\/[^"']*|[^"']*\.(controller|prisma|module)(\.ts)?)["']/;

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

export function info(msg) {
  console.log(`  • ${msg}`);
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

export function rel(cwd, file) {
  return path.relative(cwd, file).split(path.sep).join("/");
}

// Relative import specifier between a directory and a file/dir, always starting with "./" or
// "../", without the ".ts" extension.
export function importPath(fromDir, toFile) {
  let spec = path.relative(fromDir, toFile).split(path.sep).join("/").replace(/\.ts$/, "");
  if (!spec.startsWith(".")) spec = `./${spec}`;
  return spec;
}

// Generic CLI parser: `spec` maps a flag to { key, multi?, bool? }.
export function parseArgs(argv, spec) {
  const args = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--cwd") {
      if (argv[i + 1] === undefined) fail("Missing value for --cwd");
      args.cwd = path.resolve(argv[(i += 1)]);
      continue;
    }
    const def = spec[flag];
    if (!def) fail(`Unknown option: ${flag}`);
    if (def.bool) {
      args[def.key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${flag}`);
    i += 1;
    if (def.multi) (args[def.key] ??= []).push(value);
    else args[def.key] = value;
  }
  return args;
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

// Renders a template: `{{key}}` placeholders plus line-level sections. A line that is exactly
// `{{#flag}}` / `{{^flag}}` opens a section kept when `flag` is truthy / falsy; `{{/flag}}` closes it.
export function render(templatePath, vars) {
  const source = fs.readFileSync(path.join(TEMPLATES_DIR, templatePath), "utf8");
  const out = [];
  const stack = [];
  for (const line of source.split("\n")) {
    const section = /^\s*\{\{([#^/])(\w+)\}\}\s*$/.exec(line);
    if (section) {
      const [, kind, key] = section;
      if (kind === "/") {
        if (stack.pop()?.key !== key) fail(`Unbalanced section {{/${key}}} in ${templatePath}`);
      } else {
        if (!(key in vars)) fail(`Unknown section ${key} in ${templatePath}`);
        stack.push({ key, keep: kind === "#" ? Boolean(vars[key]) : !vars[key] });
      }
      continue;
    }
    if (stack.some((item) => !item.keep)) continue;
    out.push(
      line.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (!(key in vars)) fail(`Unknown placeholder ${match} in ${templatePath}`);
        return vars[key];
      }),
    );
  }
  if (stack.length) fail(`Unclosed section {{#${stack[0].key}}} in ${templatePath}`);
  return out.join("\n");
}

// Formats the given files with the monorepo Prettier when it is installed (deterministic output).
export function format(cwd, files) {
  const bin = path.join(cwd, "node_modules", ".bin", "prettier");
  if (!files.length || !fs.existsSync(bin)) return false;
  const result = spawnSync(bin, ["--write", "--log-level", "warn", ...files], { cwd, stdio: "inherit" });
  return result.status === 0;
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

// --module accepts the folder name (`auth`) or any path inside it (`modules/auth/src/user`).
export function resolveModule(cwd, moduleArg) {
  if (!moduleArg) fail("Missing --module <module>");
  const modulesDir = path.join(cwd, "modules");
  let name = moduleArg;
  if (moduleArg.includes("/")) {
    const inside = path.relative(modulesDir, path.resolve(cwd, moduleArg));
    if (inside.startsWith("..") || path.isAbsolute(inside) || inside === "") {
      fail(`--module path must be inside modules/, got ${moduleArg}`);
    }
    name = inside.split(path.sep)[0];
  }
  if (!KEBAB_RE.test(name)) fail(`Invalid module name "${name}". Use the folder name in modules/.`);
  const moduleDir = path.join(modulesDir, name);
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    const available = fs.existsSync(modulesDir)
      ? fs.readdirSync(modulesDir).filter((item) => !item.startsWith("."))
      : [];
    fail(`Module "${name}" does not exist in modules/. Available: ${available.join(", ") || "none"}`);
  }
  const srcDir = path.join(moduleDir, "src");
  const srcIndex = path.join(srcDir, "index.ts");
  if (!fs.existsSync(srcIndex)) fail(`Missing ${rel(cwd, srcIndex)}`);
  return { name, moduleDir, srcDir, srcIndex, testDir: path.join(moduleDir, "test") };
}

// Normalizes the use case name: kebab file name, PascalCase class without a "UseCase" suffix.
export function resolveName(raw) {
  if (!raw) fail("Missing --name <use case name>");
  let words = toWords(raw.replace(/\.usecase(\.ts)?$/i, ""));
  const stripped = [];
  while (words.length > 1 && words.at(-1) === "usecase") stripped.push(words.pop());
  if (words.length > 2 && words.at(-2) === "use" && words.at(-1) === "case") {
    words = words.slice(0, -2);
    stripped.push("use-case");
  }
  if (!words.length) fail(`Invalid use case name "${raw}".`);
  const kebab = words.join("-");
  return { kebab, pascal: toPascal(kebab), camel: toCamel(kebab), stripped: stripped.length > 0 };
}

// Destination of the use case.
//   convention: modules/<module>/src/<aggregate>/usecase/<name>.usecase.ts
//   explicit:   any modules/<module>/src/**/usecase/<name>.usecase.ts
// The test mirrors the path inside test/: test/<same folders>/<name>.usecase.test.ts
export function resolveTarget(cwd, mod, { aggregate, path: explicitPath, name }) {
  if (aggregate && explicitPath) fail("Use either --aggregate or --path, not both.");
  if (!aggregate && !explicitPath) fail("Missing --aggregate <name> or --path <use case file>");

  let file;
  let aggregateDir;
  let useCaseName = name;

  if (aggregate) {
    const kebab = toKebab(aggregate);
    if (!KEBAB_RE.test(kebab)) fail(`Invalid aggregate name "${aggregate}".`);
    if (RESERVED.has(kebab)) fail(`"${kebab}" is a reserved folder name and cannot be used as an aggregate.`);
    aggregateDir = path.join(mod.srcDir, kebab);
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
    file = path.join(aggregateDir, "usecase", `${useCaseName.kebab}.usecase.ts`);
  } else {
    file = path.resolve(cwd, explicitPath);
    const inSrc = path.relative(mod.srcDir, file);
    if (inSrc.startsWith("..") || path.isAbsolute(inSrc)) {
      fail(`--path must be inside ${rel(cwd, mod.srcDir)}/, got ${explicitPath}`);
    }
    const match = /^(.+)\.usecase\.ts$/.exec(path.basename(file));
    if (!match || !KEBAB_RE.test(match[1])) {
      fail(`--path must end with "<kebab-case-name>.usecase.ts", got "${path.basename(file)}".`);
    }
    if (path.basename(path.dirname(file)) !== "usecase") {
      fail(`The use case must live in a "usecase" folder, got ${rel(cwd, path.dirname(file))}/`);
    }
    aggregateDir = path.dirname(path.dirname(file));
    if (aggregateDir === mod.srcDir) fail("The usecase folder must be inside an aggregate folder, not directly in src/.");
    if (!fs.existsSync(aggregateDir)) {
      fail(`Aggregate folder ${rel(cwd, aggregateDir)} does not exist. Create it first with the module-aggregate skill.`);
    }
    const fromPath = resolveName(match[1]);
    if (useCaseName && useCaseName.kebab !== fromPath.kebab) {
      fail(`--name "${useCaseName.kebab}" does not match the file name "${match[1]}.usecase.ts".`);
    }
    useCaseName = fromPath;
  }

  const usecaseDir = path.dirname(file);
  const testFile = path.join(mod.testDir, path.relative(mod.srcDir, file)).replace(/\.ts$/, ".test.ts");
  return {
    name: useCaseName,
    file,
    usecaseDir,
    aggregateDir,
    indexFile: path.join(usecaseDir, "index.ts"),
    testFile,
    testDir: path.dirname(testFile),
  };
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

// Entity handled by the use case: --entity, or the single entity class of the aggregate model folder.
// Returns null when it cannot be inferred and `required` is false.
export function resolveEntity(cwd, mod, target, entityArg, required) {
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
  if (candidates.length === 1) return withState(cwd, candidates[0]);
  if (!required) return null;
  fail(
    `Could not infer the entity: ${rel(cwd, modelDir)}/ declares ${candidates.length} entity classes` +
      (candidates.length ? ` (${candidates.map((item) => item.name).join(", ")})` : "") +
      ". Pass --entity <Name>.",
  );
}

// Reads `<Entity>State` from the entity file. `fields` are the own state fields, in order.
function withState(cwd, entity) {
  const source = fs.readFileSync(entity.file, "utf8");
  const stateName = `${entity.name}State`;
  const match = new RegExp(`export\\s+interface\\s+${stateName}\\s+extends\\s+EntityState\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!match) {
    fail(`"export interface ${stateName} extends EntityState { ... }" was not found in ${rel(cwd, entity.file)}.`);
  }
  return {
    ...entity,
    camel: entity.name[0].toLowerCase() + entity.name.slice(1),
    kebab: toKebab(entity.name),
    stateName,
    fields: parseFields(match[1].split("\n")),
  };
}

// Parses `name: type;` / `name?: type;` lines (or CLI values) into { name, optional, type }.
export function parseFields(lines) {
  const fields = [];
  for (const line of lines) {
    const field = /^\s*([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*(.+?);?\s*$/.exec(line);
    if (field) fields.push({ name: field[1], optional: Boolean(field[2]), type: field[3].trim() });
  }
  return fields;
}

export function parseFieldArgs(values = [], flag) {
  const fields = values.map((value) => {
    const [field] = parseFields([value]);
    if (!field) fail(`Invalid ${flag} "${value}". Use "name: type" or "name?: type".`);
    return field;
  });
  const names = fields.map((field) => field.name);
  const duplicated = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicated) fail(`${flag} "${duplicated}" is declared more than once.`);
  return fields;
}

export function exportedTypesOf(file) {
  const source = fs.readFileSync(file, "utf8");
  return new Set(
    [...source.matchAll(/export\s+(?:interface|type|class|enum|const)\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]),
  );
}

// Finds `export interface <name>` in the module src. Returns the file and the import specifier
// to use from the usecase folder ("../provider" for the aggregate provider folder).
export function resolveDependency(cwd, mod, target, interfaceName) {
  if (!PASCAL_RE.test(interfaceName)) fail(`Invalid --dep "${interfaceName}". Use the interface name, e.g. UserRepository.`);
  const files = listTsFiles(mod.srcDir).filter((file) =>
    new RegExp(`export\\s+interface\\s+${interfaceName}\\b`).test(fs.readFileSync(file, "utf8")),
  );
  if (files.length === 0) {
    fail(
      `Dependency interface "${interfaceName}" was not found in ${rel(cwd, mod.srcDir)}/. ` +
        "Create the contract first (e.g. with the module-repository skill) or fix the name.",
    );
  }
  if (files.length > 1) fail(`Interface "${interfaceName}" is declared more than once in the module.`);
  const file = files[0];
  const dir = path.dirname(file);
  const spec = fs.existsSync(path.join(dir, "index.ts")) ? importPath(target.usecaseDir, dir) : importPath(target.usecaseDir, file);
  return { name: interfaceName, param: toCamel(interfaceName), file, spec };
}

// Extracts the filter and sort-field type arguments of the repository page contract:
// CrudRepository<E, C, U, Filter, Sort?, Id?> or FindPageRepository<E, Filter, Sort?>.
export function resolvePageTypes(dependency) {
  const source = fs.readFileSync(dependency.file, "utf8");
  for (const [contract, filterIndex] of [["CrudRepository", 3], ["FindPageRepository", 1]]) {
    const start = source.search(new RegExp(`\\b${contract}\\s*<`));
    if (start < 0) continue;
    const open = source.indexOf("<", start);
    let depth = 0;
    let current = "";
    const args = [];
    for (let i = open; i < source.length; i += 1) {
      const char = source[i];
      if (char === "<") {
        depth += 1;
        if (depth === 1) continue;
      }
      if (char === ">") {
        depth -= 1;
        if (depth === 0) {
          args.push(current.trim());
          break;
        }
      }
      if (char === "," && depth === 1) {
        args.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    const filter = args[filterIndex] ?? "unknown";
    const sort = args[filterIndex + 1];
    const types = [filter, sort].filter((type) => type && /^[A-Z][A-Za-z0-9]*$/.test(type));
    const local = types.filter((type) => exportedTypesOf(dependency.file).has(type));
    return { filter, sort, imports: local };
  }
  return null;
}

// Fake naming follows the module convention:
//   test/mock/*.mock.ts and no fake-*.ts -> <base>.<kind>.mock.ts / <Interface>Mock
//   otherwise (default)                  -> fake-<base>.<kind>.ts / Fake<Interface>
export function fakeConvention(mod) {
  const mockDir = path.join(mod.testDir, "mock");
  const existing = fs.existsSync(mockDir) ? fs.readdirSync(mockDir) : [];
  const hasFake = existing.some((name) => /^fake-.+\.ts$/.test(name) && !name.endsWith(".test.ts"));
  const hasMock = existing.some((name) => /\.mock\.ts$/.test(name));
  return { mockDir, style: hasMock && !hasFake ? "mock" : "fake" };
}

function fakeFileName(interfaceName, style) {
  const words = toWords(interfaceName);
  const kind = words.length > 1 ? words.pop() : null;
  const base = [words.join("-"), kind].filter(Boolean).join(".");
  return style === "mock" ? `${base}.mock.ts` : `fake-${base}.ts`;
}

// Looks for an existing concrete class in test/ that implements the interface. Prefers
// test/mock/. Returns { className, file, spec?, exported, created:false } or the planned new fake.
export function resolveFake(cwd, mod, target, dependency) {
  const { mockDir, style } = fakeConvention(mod);
  const pattern = new RegExp(`export\\s+class\\s+([A-Z][A-Za-z0-9]*)[^{]*\\bimplements\\s+[^{]*\\b${dependency.name}\\b`);
  const found = listTsFiles(mod.testDir)
    .filter((file) => !file.endsWith(".test.ts"))
    .map((file) => ({ file, match: pattern.exec(fs.readFileSync(file, "utf8")) }))
    .filter((item) => item.match)
    .sort((a, b) => Number(path.dirname(b.file) === mockDir) - Number(path.dirname(a.file) === mockDir));

  const mockIndex = path.join(mockDir, "index.ts");
  const fromTest = (file) => {
    const dir = path.dirname(file);
    const index = path.join(dir, "index.ts");
    const exported = fs.existsSync(index) && hasExport(fs.readFileSync(index, "utf8"), importPath(dir, file));
    return { exported, spec: exported ? importPath(target.testDir, dir) : importPath(target.testDir, file) };
  };

  if (found.length) {
    const { file, match } = found[0];
    return { className: match[1], file, created: false, ...fromTest(file) };
  }
  const file = path.join(mockDir, fakeFileName(dependency.name, style));
  return {
    className: style === "mock" ? `${dependency.name}Mock` : `Fake${dependency.name}`,
    file,
    created: true,
    exported: true,
    spec: importPath(target.testDir, mockDir),
    indexFile: mockIndex,
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

// Builds `import { A, B } from "x";` lines, specifiers and names sorted, packages first.
export function buildImports(map) {
  return [...map.entries()]
    .filter(([, names]) => names.size)
    .sort(([a], [b]) => Number(a.startsWith(".")) - Number(b.startsWith(".")) || a.localeCompare(b))
    .map(([spec, names]) => `import { ${[...names].sort().join(", ")} } from "${spec}";`)
    .join("\n");
}

export function addImport(map, spec, ...names) {
  if (!map.has(spec)) map.set(spec, new Set());
  names.forEach((name) => map.get(spec).add(name));
}
