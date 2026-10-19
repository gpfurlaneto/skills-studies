#!/usr/bin/env node
// Scaffolds one use case of an aggregate inside a business module, plus its unit test.
//
// Writes (only what is missing; never overwrites hand-written code):
//   modules/<module>/src/<aggregate>/usecase/<name>.usecase.ts       (In / Out contracts + class)
//   modules/<module>/src/<aggregate>/usecase/index.ts                 (+ export, then the chain up to src/index.ts)
//   modules/<module>/test/<aggregate>/usecase/<name>.usecase.test.ts  (tests over the module fakes)
//   modules/<module>/test/mock/<fake>.ts + test/mock/index.ts         (only for a dependency with no fake yet)
//
// Usage:
//   node scaffold-usecase.mjs --module <module|path> (--aggregate <name> | --path <file>)
//     --name <use case> --type <crud|custom> --output <yes|no>
//     [--operation <create|update|delete|find-by-id|find-page>] [--entity <Name>]
//     [--dep <Interface>]... [--in-field "name: type"]... [--out-field "name: type"]...
//     [--dry-run] [--cwd <monorepo root>]

import fs from "node:fs";
import path from "node:path";
import {
  CRUD_OPERATIONS,
  MARKER,
  SCENARIOS,
  addExport,
  addImport,
  buildImports,
  exportChain,
  exportedTypesOf,
  fail,
  format,
  importPath,
  info,
  ok,
  parseArgs,
  parseFieldArgs,
  rel,
  render,
  resolveDependency,
  resolveEntity,
  resolveFake,
  resolveModule,
  resolveName,
  resolvePageTypes,
  resolveSharedPackage,
  resolveTarget,
  toWords,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2), {
  "--module": { key: "module" },
  "--aggregate": { key: "aggregate" },
  "--path": { key: "path" },
  "--name": { key: "name" },
  "--type": { key: "type" },
  "--output": { key: "output" },
  "--operation": { key: "operation" },
  "--entity": { key: "entity" },
  "--dep": { key: "deps", multi: true },
  "--in-field": { key: "inFields", multi: true },
  "--out-field": { key: "outFields", multi: true },
  "--dry-run": { key: "dryRun", bool: true },
});

// 1. Inputs ------------------------------------------------------------------------------------
const { cwd } = args;
if (!args.type) fail(`Missing --type <${SCENARIOS.join("|")}>`);
if (!SCENARIOS.includes(args.type)) fail(`Invalid --type "${args.type}". Use one of: ${SCENARIOS.join(", ")}`);
if (!["yes", "no"].includes(args.output ?? "")) fail("Missing or invalid --output <yes|no> (does the use case return data?)");
if (!args.name && !args.path) fail("Missing --name <use case name>");

const mod = resolveModule(cwd, args.module);
const shared = resolveSharedPackage(mod.moduleDir, cwd);
const target = resolveTarget(cwd, mod, { ...args, name: args.name ? resolveName(args.name) : undefined });
const { name } = target;
const output = args.output === "yes";
const crud = args.type === "crud";
const entity = resolveEntity(cwd, mod, target, args.entity, crud);
const inFieldArgs = parseFieldArgs(args.inFields, "--in-field");
const outFieldArgs = parseFieldArgs(args.outFields, "--out-field");

let operation = null;
if (crud) {
  operation = args.operation ?? inferOperation(name.kebab, entity.kebab);
  if (!operation) {
    fail(
      `Could not infer the crud operation from "${name.kebab}". Pass --operation <${CRUD_OPERATIONS.join("|")}> ` +
        `(conventional names: create-${entity.kebab}, update-${entity.kebab}, delete-${entity.kebab}, ` +
        `find-${entity.kebab}-by-id, find-${entity.kebab}-page).`,
    );
  }
  if (!CRUD_OPERATIONS.includes(operation)) fail(`Invalid --operation "${operation}". Use one of: ${CRUD_OPERATIONS.join(", ")}`);
  if (["find-by-id", "find-page"].includes(operation) && !output) fail(`A crud "${operation}" use case always returns data: use --output yes.`);
  if (operation === "find-page" && inFieldArgs.length) {
    fail("find-page receives PageRequest<Filter>: declare filter fields in the repository filter type, not with --in-field.");
  }
} else if (args.operation) {
  fail("--operation is only valid with --type crud.");
}
if (!output && outFieldArgs.length) fail("--out-field requires --output yes.");

// crud: the aggregate repository is always the first dependency.
const depNames = [...new Set([...(crud ? [`${entity.name}Repository`] : []), ...(args.deps ?? [])])];
const deps = depNames.map((dep) => resolveDependency(cwd, mod, target, dep));
const repo = crud ? deps[0] : null;

// 2. Contracts ---------------------------------------------------------------------------------
const idField = { name: "id", optional: false, type: "string" };
const timestamps = [
  { name: "createdAt", optional: false, type: "Date" },
  { name: "updatedAt", optional: false, type: "Date" },
];
const entityData = entity ? [idField, ...entity.fields, ...timestamps] : [];

const inFields = inFieldArgs.length
  ? crud && ["update", "delete", "find-by-id"].includes(operation) && !inFieldArgs.some((f) => f.name === "id")
    ? [idField, ...inFieldArgs]
    : inFieldArgs
  : {
      create: entity?.fields,
      update: entity && [idField, ...entity.fields],
      delete: [idField],
      "find-by-id": [idField],
    }[operation] ?? [];

const outFields = !output
  ? []
  : outFieldArgs.length
    ? outFieldArgs
    : { create: [idField], update: [idField], delete: [idField], "find-by-id": entityData, "find-page": entityData }[operation] ?? [];

const fieldLines = (fields, what) =>
  fields.length
    ? fields.map((f) => `  ${f.name}${f.optional ? "?" : ""}: ${f.type};`).join("\n")
    : `  // ${MARKER}: declare the ${what} fields the user described, or replace this line with a plain "// TODO:" placeholder.`;
const mapping = (fields, source) => fields.map((f) => `      ${f.name}: ${source}.${f.name},`).join("\n");

// 3. Use case imports --------------------------------------------------------------------------
const imports = new Map();
addImport(imports, shared, "UseCase");
const modelSpec = entity
  ? fs.existsSync(path.join(path.dirname(entity.file), "index.ts"))
    ? importPath(target.usecaseDir, path.dirname(entity.file))
    : importPath(target.usecaseDir, entity.file)
  : null;
if (operation === "create") addImport(imports, modelSpec, entity.name);
if (["update", "delete", "find-by-id"].includes(operation)) addImport(imports, shared, "NotFoundError");
deps.forEach((dep) => addImport(imports, dep.spec, dep.name));

let pageArgs = "";
if (operation === "find-page") {
  addImport(imports, shared, "IntegerRule", "MinValueRule", "PageRequest", "PageResult", "RequiredRule", "Validator");
  const page = resolvePageTypes(repo);
  if (!page) fail(`${repo.name} does not extend CrudRepository<...> or FindPageRepository<...>: it has no findPage contract.`);
  pageArgs = page.sort && page.sort !== "string" ? `${page.filter}, ${page.sort}` : page.filter;
  addImport(imports, repo.spec, ...page.imports);
}

// Named types used in field declarations: imported from the entity file or a dependency file.
const BUILT_IN = new Set(["Date", "Record", "Array", "Promise", "Partial", "Readonly", "Pick", "Omit", "Map", "Set"]);
const unresolvedTypes = [];
for (const field of [...inFields, ...outFields]) {
  for (const [type] of field.type.matchAll(/\b[A-Z][A-Za-z0-9]*\b/g)) {
    if (BUILT_IN.has(type) || type === name.pascal || type.startsWith(`${name.pascal}`)) continue;
    if (entity && exportedTypesOf(entity.file).has(type)) addImport(imports, modelSpec, type);
    else {
      const dep = deps.find((item) => exportedTypesOf(item.file).has(type));
      if (dep) addImport(imports, dep.spec, type);
      else unresolvedTypes.push(type);
    }
  }
}

const constructorBlock = deps.length
  ? `  constructor(${deps.map((dep) => `private readonly ${dep.param}: ${dep.name}`).join(", ")}) {}`
  : "";

const vars = {
  name: name.pascal,
  imports: buildImports(imports),
  output,
  outType: output ? `${name.pascal}Out` : "void",
  inFields: fieldLines(inFields, "input"),
  outFields: fieldLines(outFields, "output"),
  constructor: constructorBlock,
  hasDeps: deps.length > 0,
  entity: entity?.name ?? "",
  entityCamel: entity?.camel ?? "",
  code: entity?.camel ?? "",
  repo: repo?.param ?? "",
  pageArgs,
  outMapping: mapping(
    outFields,
    { create: "created", update: "updated", delete: entity?.camel, "find-by-id": entity?.camel, "find-page": entity?.camel }[operation] ?? "",
  ),
};
vars.contracts = render("usecase/contracts.ts.tpl", vars);
const useCaseSource = `${render(`usecase/${operation ?? "custom"}.ts.tpl`, vars).trimEnd()}\n`;

// 4. Fakes and test ----------------------------------------------------------------------------
const fakes = deps.map((dep) => ({ dep, ...resolveFake(cwd, mod, target, dep) }));
const repoFake = repo ? fakes[0] : null;

const testImports = new Map();
const srcIndexSpec = importPath(target.testDir, mod.srcIndex);
addImport(testImports, srcIndexSpec, name.pascal);
if (["create", "update"].includes(operation) || !crud) addImport(testImports, srcIndexSpec, `${name.pascal}In`);
if (["create", "update"].includes(operation)) addImport(testImports, srcIndexSpec, entity.name);
const needsState = ["update", "delete", "find-by-id", "find-page"].includes(operation);
if (needsState) addImport(testImports, srcIndexSpec, entity.name, entity.stateName);
const needsErrors = ["create", "update", "find-page"].includes(operation);
if (needsErrors) addImport(testImports, shared, "ValidationException");
if (["update", "delete", "find-by-id"].includes(operation)) addImport(testImports, shared, "NotFoundError");
fakes.forEach((fake) => addImport(testImports, fake.spec, fake.className));

const makeSut = [
  `function makeSut(${fakes.map((fake) => `${fake.dep.param} = new ${fake.className}()`).join(", ")}) {`,
  `  const useCase = new ${name.pascal}(${deps.map((dep) => dep.param).join(", ")});`,
  "",
  `  return { ${["useCase", ...deps.map((dep) => dep.param)].join(", ")} };`,
  "}",
].join("\n");

const testVars = {
  ...vars,
  testImports: buildImports(testImports),
  needsState,
  needsErrors,
  makeSut,
  label: entity ? toWords(entity.name).join(" ") : "",
  repoInterface: repo?.name ?? "",
  repoFake: repoFake?.className ?? "",
  outMapping: mapping(outFields, entity?.camel ?? ""),
};
testVars.helpers = render("test/helpers.ts.tpl", testVars);
const testSource = `${render(`test/${operation ?? "custom"}.test.ts.tpl`, testVars).trimEnd()}\n`;

// 5. Plan --------------------------------------------------------------------------------------
const writes = [];
const notes = [];
const isPlaceholder = (source) =>
  /is not implemented yet\.?["']\)/.test(source) && new RegExp(`export\\s+class\\s+${name.pascal}\\b`).test(source);

if (!fs.existsSync(target.file)) writes.push({ file: target.file, content: useCaseSource, action: "create" });
else {
  const current = fs.readFileSync(target.file, "utf8");
  if (isPlaceholder(current)) writes.push({ file: target.file, content: useCaseSource, action: "replace placeholder" });
  else notes.push(`UPDATE MODE: ${rel(cwd, target.file)} is hand-written and was not touched. Edit it by hand with the same pattern.`);
}
const updateMode = notes.length > 0;

if (!fs.existsSync(target.testFile)) {
  if (updateMode) notes.push(`UPDATE MODE: ${rel(cwd, target.testFile)} does not exist; it was generated from the template, adapt it to the existing use case.`);
  writes.push({ file: target.testFile, content: testSource, action: "create" });
} else notes.push(`${rel(cwd, target.testFile)} already exists and was not touched. Extend it by hand.`);

const pendingIndex = new Map();
const queueExport = (indexFile, spec) => {
  const current = pendingIndex.get(indexFile) ?? (fs.existsSync(indexFile) ? fs.readFileSync(indexFile, "utf8") : "");
  const result = addExport(current, spec);
  if (result.changed) pendingIndex.set(indexFile, result.content);
};
queueExport(target.indexFile, `./${path.basename(target.file, ".ts")}`);
exportChain(target.usecaseDir, mod.srcDir).forEach(({ indexFile, spec }) => queueExport(indexFile, spec));

for (const fake of fakes.filter((item) => item.created)) {
  writes.push({
    file: fake.file,
    content: `${render("fake/fake.ts.tpl", {
      interface: fake.dep.name,
      className: fake.className,
      srcIndex: importPath(path.dirname(fake.file), mod.srcIndex),
    }).trimEnd()}\n`,
    action: "create fake skeleton",
  });
  queueExport(fake.indexFile, importPath(path.dirname(fake.file), fake.file));
}
for (const [file, content] of pendingIndex) {
  writes.push({ file, content, action: fs.existsSync(file) ? "add export" : "create" });
}

// 6. Report / write ----------------------------------------------------------------------------
console.log(`\nUse case ${name.pascal} (${rel(cwd, target.file)})`);
info(`module: ${mod.name}, aggregate: ${rel(cwd, target.aggregateDir)}, scenario: ${args.type}${operation ? ` / ${operation}` : ""}`);
info(`contracts: ${name.pascal}In${output ? `, ${name.pascal}Out` : ""} -> UseCase<${name.pascal}In, ${vars.outType}>`);
if (name.stripped) info(`the "UseCase" suffix was removed from the name: class ${name.pascal}`);
if (entity) info(`entity: ${entity.name} (${rel(cwd, entity.file)})`);
info(`dependencies: ${deps.map((dep) => `${dep.param}: ${dep.name}`).join(", ") || "none"}`);
for (const fake of fakes) {
  info(`${fake.dep.name} fake: ${fake.className} (${rel(cwd, fake.file)})${fake.created ? " [NEW skeleton]" : " [reused]"}`);
}
if (unresolvedTypes.length) info(`types not found in the entity or dependency files (import them by hand): ${[...new Set(unresolvedTypes)].join(", ")}`);
notes.forEach((note) => info(note));
console.log("\nFiles:");
writes.forEach(({ file, action }) => info(`${action}: ${rel(cwd, file)}`));

if (args.dryRun) {
  console.log("\n(dry run: nothing was written)");
  process.exit(0);
}

for (const { file, content } of writes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
const formatted = format(
  cwd,
  writes.filter(({ action }) => action !== "add export").map(({ file }) => file),
);
ok(`${writes.length} file(s) written${formatted ? " and formatted with prettier" : ""}`);

const pending = writes.filter(({ file }) => fs.readFileSync(file, "utf8").includes(MARKER));
if (pending.length) {
  console.log(`\nResolve the "${MARKER}" markers in:`);
  pending.forEach(({ file }) => info(rel(cwd, file)));
}
console.log(
  `\nThen run: node .claude/skills/module-use-case/scripts/verify-usecase.mjs --module ${mod.name} --path ${rel(cwd, target.file)}`,
);

function inferOperation(kebab, entityKebab) {
  if (kebab === `create-${entityKebab}`) return "create";
  if (kebab === `update-${entityKebab}`) return "update";
  if (kebab === `delete-${entityKebab}`) return "delete";
  if (kebab === `find-${entityKebab}-by-id`) return "find-by-id";
  if (kebab === `find-${entityKebab}-page`) return "find-page";
  return null;
}
