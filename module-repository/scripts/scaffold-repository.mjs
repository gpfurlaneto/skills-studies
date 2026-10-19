#!/usr/bin/env node
// Deterministic scaffold of a repository contract and its in-memory fake inside a business module.
//
// From the inputs alone (same inputs + same module state -> same files) it creates or updates:
//   modules/<module>/src/<aggregate>/provider/<aggregate>.repository.ts   interface <Entity>Repository
//   modules/<module>/src/<aggregate>/provider/index.ts                     + export of the repository
//   modules/<module>/src/**/index.ts                                       export chain up to src/index.ts
//   modules/<module>/test/mock/fake-<aggregate>.repository.ts              class Fake<Entity>Repository
//   modules/<module>/test/mock/fake-<aggregate>.repository.test.ts         unit test of the fake
//   modules/<module>/test/mock/index.ts                                    + export of the fake
// When the module already names its fakes "<aggregate>.repository.mock.ts", that convention
// (class <Entity>RepositoryMock) is used instead.
//
// Usage:
//   node scaffold-repository.mjs --module <module> (--aggregate <name> | --path <file>)
//     --type <crud|custom> [--entity <Name>]
//     [--compose create,update,delete,findById,findPage]        (custom only)
//     [--method "<name>(<params>): Promise<T>"]...              (custom, or extra methods on crud)
//     [--create-input <entity|data>] [--update-input <entity|data>]
//     [--fake-path <file>] [--no-test] [--cwd <monorepo root>] [--dry-run]

import fs from "node:fs";
import path from "node:path";
import {
  INPUT_MODES,
  MARKER,
  REPOSITORY_TYPES,
  SHARED_CONTRACTS,
  SHARED_METHODS,
  addExport,
  entityImportFrom,
  exportChain,
  fail,
  importPath,
  listTsFiles,
  pluralize,
  rel,
  render,
  resolveEntity,
  resolveFake,
  resolveModule,
  resolveRepositoryTarget,
  resolveSharedPackage,
  toWords,
} from "./lib.mjs";

const METHOD_RE = /^\s*([a-z][A-Za-z0-9]*)\s*\(([\s\S]*)\)\s*:\s*(Promise<[\s\S]+>)\s*;?\s*$/;
const FILE_NAMES = { create: "create", update: "update", delete: "delete", findById: "find-by-id", findPage: "find-page" };

function parseArgs(argv) {
  const args = {
    cwd: process.cwd(),
    dryRun: false,
    test: true,
    methods: [],
    createInput: "entity",
    updateInput: "entity",
  };
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
      case "--path": args.path = next(); break;
      case "--type": args.type = next(); break;
      case "--entity": args.entity = next(); break;
      case "--compose": args.compose = next(); break;
      case "--method": args.methods.push(next()); break;
      case "--create-input": args.createInput = next(); break;
      case "--update-input": args.updateInput = next(); break;
      case "--fake-path": args.fakePath = next(); break;
      case "--no-test": args.test = false; break;
      case "--cwd": args.cwd = path.resolve(next()); break;
      case "--dry-run": args.dryRun = true; break;
      default: fail(`Unknown option: ${flag}`);
    }
  }
  if (!args.type) fail(`Missing --type <${REPOSITORY_TYPES.join("|")}>`);
  if (!REPOSITORY_TYPES.includes(args.type)) fail(`Invalid --type "${args.type}". Use one of: ${REPOSITORY_TYPES.join(", ")}`);
  for (const [flag, value] of [["--create-input", args.createInput], ["--update-input", args.updateInput]]) {
    if (!INPUT_MODES.includes(value)) fail(`Invalid ${flag} "${value}". Use one of: ${INPUT_MODES.join(", ")}`);
  }
  return args;
}

function resolveComposition(args) {
  if (args.type === "crud") {
    if (args.compose !== undefined) fail("--compose is only valid with --type custom (crud always composes CrudRepository).");
    return [...SHARED_METHODS];
  }
  const requested = (args.compose ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of requested) {
    if (!SHARED_METHODS.includes(item)) fail(`Invalid --compose entry "${item}". Use: ${SHARED_METHODS.join(", ")}`);
  }
  if (new Set(requested).size !== requested.length) fail("--compose has repeated entries.");
  const composed = SHARED_METHODS.filter((item) => requested.includes(item));
  if (composed.length === 0 && args.methods.length === 0) {
    fail("A custom repository needs at least one --method or one --compose entry.");
  }
  return composed;
}

function parseMethods(raw, composed) {
  const methods = raw.map((signature) => {
    const match = METHOD_RE.exec(signature);
    if (!match) fail(`Invalid --method "${signature}". Expected "<name>(<params>): Promise<T>".`);
    const [, name, params, returns] = match;
    if (SHARED_METHODS.includes(name)) {
      fail(`"${name}" is a shared contract method. Use --compose ${name} (or --type crud) instead of redeclaring it.`);
    }
    return { name, signature: `${name}(${params.trim()}): ${returns.trim()}` };
  });
  const names = methods.map((method) => method.name);
  if (new Set(names).size !== names.length) fail("--method has repeated method names.");
  if (composed.some((item) => names.includes(item))) fail("A --method name collides with a composed contract.");
  return methods;
}

// Types used by the custom signatures that the entity file exports (e.g. a union declared next to
// the entity). They are imported automatically; any other type must be declared by hand.
function signatureTypesFromEntity(methods, entity) {
  const source = fs.readFileSync(entity.file, "utf8");
  const exported = new Set(
    [...source.matchAll(/export\s+(?:interface|type|class|enum|const)\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]),
  );
  exported.delete(entity.name);
  const used = new Set(methods.flatMap((method) => method.signature.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? []));
  return [...used].filter((name) => exported.has(name)).sort();
}

function sortedImport(names, from) {
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) return null;
  if (unique.length <= 3) return `import { ${unique.join(", ")} } from "${from}";`;
  return `import {\n${unique.map((name) => `  ${name},`).join("\n")}\n} from "${from}";`;
}

// ---------------------------------------------------------------------------------------------
// Repository interface

function buildRepository(ctx) {
  const { names, composed, methods, createInput, updateInput, isCrud, sharedPackage, entityImport } = ctx;
  const { pascal } = names;
  const usesCreateData = composed.includes("create") && createInput === "data";
  const usesUpdateData = composed.includes("update") && updateInput === "data";
  const usesFilter = composed.includes("findPage");
  const createType = usesCreateData ? `Create${pascal}Data` : pascal;
  const updateType = usesUpdateData ? `Update${pascal}Data` : pascal;

  const contracts = isCrud
    ? []
    : composed.map((item) => {
        switch (item) {
          case "create": return `${SHARED_CONTRACTS.create}<${createType}, ${pascal}>`;
          case "update": return `${SHARED_CONTRACTS.update}<${updateType}, ${pascal}>`;
          case "delete": return SHARED_CONTRACTS.delete;
          case "findById": return `${SHARED_CONTRACTS.findById}<${pascal}>`;
          default: return `${SHARED_CONTRACTS.findPage}<${pascal}, ${pascal}Filter>`;
        }
      });

  const sharedNames = isCrud ? ["CrudRepository"] : composed.map((item) => SHARED_CONTRACTS[item]);
  const entityNames = [
    pascal,
    ...(usesCreateData || usesUpdateData ? [`${pascal}State`] : []),
    ...ctx.signatureTypes,
  ];
  const imports = [sortedImport(sharedNames, sharedPackage), sortedImport(entityNames, entityImport)]
    .filter(Boolean)
    .join("\n");

  const types = [];
  if (usesCreateData) types.push(render("repository/create-data.ts.tpl", names).trim());
  if (usesUpdateData) types.push(render("repository/update-data.ts.tpl", names).trim());
  if (usesFilter) types.push(render("repository/filter.ts.tpl", names).trim());

  const body = methods.length ? ` {\n${methods.map((method) => `  ${method.signature};`).join("\n")}\n}` : " {}";
  let declaration;
  if (isCrud) {
    declaration =
      `export interface ${pascal}Repository extends CrudRepository<\n` +
      `  ${pascal},\n  ${createType},\n  ${updateType},\n  ${pascal}Filter\n>${body}`;
  } else if (contracts.length === 0) {
    declaration = `export interface ${pascal}Repository${body}`;
  } else if (contracts.length === 1) {
    declaration = `export interface ${pascal}Repository extends ${contracts[0]}${body}`;
  } else {
    declaration =
      `export interface ${pascal}Repository\n` +
      `  extends ${contracts[0]},\n` +
      contracts.slice(1).map((contract) => `    ${contract}`).join(",\n") +
      body;
  }

  return [imports, ...types, `${declaration}\n`].join("\n\n");
}

// ---------------------------------------------------------------------------------------------
// In-memory fake

function buildFake(ctx) {
  const { names, composed, methods, createInput, updateInput, sharedPackage, srcImport } = ctx;
  const { pascal } = names;

  const sharedNames = [];
  if (composed.includes("update") || composed.includes("delete")) sharedNames.push("NotFoundError");
  if (composed.includes("findPage")) sharedNames.push("PageRequest", "PageResult");
  const srcNames = [pascal, `${pascal}Repository`, ...ctx.signatureTypes];
  if (composed.includes("create") && createInput === "data") srcNames.push(`Create${pascal}Data`);
  if (composed.includes("update") && updateInput === "data") srcNames.push(`Update${pascal}Data`);
  if (composed.includes("findPage")) srcNames.push(`${pascal}Filter`);

  const methodBlocks = composed.map((item) => {
    if (item === "create") return render(`fake/methods/create.${createInput}.ts.tpl`, names);
    if (item === "update") return render(`fake/methods/update.${updateInput}.ts.tpl`, names);
    return render(`fake/methods/${FILE_NAMES[item]}.ts.tpl`, names);
  });
  for (const method of methods) {
    methodBlocks.push(render("fake/methods/custom.ts.tpl", { ...names, ...method }));
  }

  return render("fake/class.ts.tpl", {
    ...names,
    imports: [sortedImport(sharedNames, sharedPackage), sortedImport(srcNames, srcImport)].filter(Boolean).join("\n"),
    methods: methodBlocks.join(""),
    helpers: composed.includes("findPage") ? render("fake/find-page-helpers.ts.tpl", names) : "",
  });
}

// Sample value for a required state field, or null when it cannot be derived safely.
function sampleValue(field) {
  const type = field.type.trim();
  const members = type.split("|").map((item) => item.trim()).filter(Boolean);
  const first = members[0];
  if (members.length > 1 && /^(["']).*\1$/.test(first)) return first.replace(/^'(.*)'$/, '"$1"');
  if (members.length > 1 && members.includes("null")) return "null";
  if (members.length > 1) return null;
  if (type === "string") return `"sample ${toWords(field.name).join(" ")}"`;
  if (type === "number") return "1";
  if (type === "boolean") return "true";
  if (type === "Date") return 'new Date("2024-01-01T10:00:00.000Z")';
  if (/\[\]$/.test(type) || /^(ReadonlyArray|Array)</.test(type)) return "[]";
  return null;
}

function buildTest(ctx) {
  const { names, composed, methods, createInput, updateInput, sharedPackage, srcImport, entity, fake } = ctx;
  const { pascal } = names;

  const sampleFields = entity.fields
    .map((field) => {
      const value = sampleValue(field);
      return value === null
        ? `    // ${MARKER}: set a sample value for "${field.name}" (${field.type}).\n`
        : `    ${field.name}: ${value},\n`;
    })
    .join("");

  const cases = composed.map((item) => {
    if (item === "create") return render(`test/cases/create.${createInput}.ts.tpl`, names);
    if (item === "update") return render(`test/cases/update.${updateInput}.ts.tpl`, names);
    return render(`test/cases/${FILE_NAMES[item]}.ts.tpl`, names);
  });
  for (const method of methods) cases.push(render("test/cases/custom.ts.tpl", { ...names, ...method }));

  const sharedNames = composed.includes("update") || composed.includes("delete") ? ["NotFoundError"] : [];
  const imports = [
    sortedImport(sharedNames, sharedPackage),
    sortedImport([pascal, `${pascal}State`], srcImport),
    sortedImport([fake.className], importPath(fake.dir, fake.file)),
  ]
    .filter(Boolean)
    .join("\n");

  return render("test/spec.ts.tpl", { ...names, imports, sampleFields, cases: cases.join("") });
}

// ---------------------------------------------------------------------------------------------

function normalize(source) {
  return source.replace(/\s+$/gm, "").trim();
}

function declaredElsewhere(srcDir, ownFile, typeNames) {
  const clashes = [];
  for (const file of listTsFiles(srcDir)) {
    if (file === ownFile) continue;
    const source = fs.readFileSync(file, "utf8");
    for (const name of typeNames) {
      if (new RegExp(`export\\s+(interface|type|class)\\s+${name}\\b`).test(source)) clashes.push({ name, file });
    }
  }
  return clashes;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { cwd } = args;
  const mod = resolveModule(cwd, args.module);
  const target = resolveRepositoryTarget(cwd, mod, args);
  const entity = resolveEntity(cwd, mod, target, args.entity);
  const sharedPackage = resolveSharedPackage(mod.moduleDir, cwd);
  const composed = resolveComposition(args);
  const methods = parseMethods(args.methods, composed);
  const isCrud = composed.length === SHARED_METHODS.length;
  const fake = resolveFake(cwd, mod, target, entity, args.fakePath);

  const pascal = entity.name;
  const camel = pascal[0].toLowerCase() + pascal.slice(1);
  const plural = pluralize(camel);
  const names = {
    pascal,
    camel,
    plural,
    code: camel,
    words: toWords(pascal).join(" "),
    pluralWords: toWords(plural).join(" "),
    fakeClass: fake.className,
    sharedPackage,
  };
  const ctx = {
    names,
    composed,
    methods,
    isCrud,
    entity,
    fake,
    sharedPackage,
    createInput: args.createInput,
    updateInput: args.updateInput,
    entityImport: entityImportFrom(target, entity),
    signatureTypes: signatureTypesFromEntity(methods, entity),
    srcImport: importPath(fake.dir, mod.srcIndex),
  };

  const clashes = declaredElsewhere(mod.srcDir, target.file, [
    `${pascal}Repository`,
    ...(composed.includes("findPage") ? [`${pascal}Filter`] : []),
    ...(composed.includes("create") && args.createInput === "data" ? [`Create${pascal}Data`] : []),
    ...(composed.includes("update") && args.updateInput === "data" ? [`Update${pascal}Data`] : []),
  ]);
  if (clashes.length) {
    fail(`Already declared elsewhere in the module: ${clashes.map(({ name, file }) => `${name} (${rel(cwd, file)})`).join(", ")}`);
  }

  const writes = [];
  const notes = [];

  // Repository interface: create, replace the untouched module-aggregate placeholder, or keep an
  // identical file. Anything else is a hand-written repository and is never overwritten.
  const repository = buildRepository(ctx);
  if (!fs.existsSync(target.file)) {
    writes.push({ file: target.file, content: repository, kind: "+" });
  } else {
    const current = fs.readFileSync(target.file, "utf8");
    const placeholder = render("repository/module-aggregate-placeholder.ts.tpl", names);
    if (normalize(current) === normalize(repository)) {
      notes.push(`= ${rel(cwd, target.file)} (already up to date)`);
    } else if (normalize(current) === normalize(placeholder)) {
      writes.push({ file: target.file, content: repository, kind: "~", note: "replaced the module-aggregate placeholder" });
    } else {
      fail(
        `${rel(cwd, target.file)} already exists with hand-written content. Nothing was changed.\n` +
          "  Update it by hand following SKILL.md (update mode), then run verify-repository.mjs.",
      );
    }
  }

  // Export chain: provider/index.ts -> aggregate/index.ts -> ... -> src/index.ts
  const pending = new Map();
  const readIndex = (file) => pending.get(file) ?? (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const exportTo = (file, spec) => {
    const result = addExport(readIndex(file), spec);
    if (result.changed) pending.set(file, result.content);
  };
  exportTo(path.join(target.providerDir, "index.ts"), `./${path.basename(target.file, ".ts")}`);
  for (const link of exportChain(target.providerDir, mod.srcDir)) exportTo(link.indexFile, link.spec);

  // In-memory fake and its test
  const fakeContent = buildFake(ctx);
  if (!fs.existsSync(fake.file)) {
    writes.push({ file: fake.file, content: fakeContent, kind: "+" });
  } else if (normalize(fs.readFileSync(fake.file, "utf8")) === normalize(fakeContent)) {
    notes.push(`= ${rel(cwd, fake.file)} (already up to date)`);
  } else {
    fail(
      `${rel(cwd, fake.file)} already exists with different content. Nothing was changed.\n` +
        "  Update it by hand following SKILL.md (update mode), then run verify-repository.mjs.",
    );
  }
  exportTo(fake.indexFile, importPath(fake.dir, fake.file));

  if (args.test) {
    if (!fs.existsSync(fake.testFile)) {
      writes.push({ file: fake.testFile, content: buildTest(ctx), kind: "+" });
    } else {
      notes.push(`= ${rel(cwd, fake.testFile)} (exists, left untouched)`);
    }
  }

  for (const [file, content] of pending) {
    writes.push({ file, content, kind: fs.existsSync(file) ? "~" : "+" });
  }

  console.log(`Module:      ${args.module}`);
  console.log(`Repository:  ${rel(cwd, target.file)}`);
  console.log(`Entity:      ${pascal} (${rel(cwd, entity.file)})`);
  console.log(`Type:        ${args.type}${isCrud ? " -> CrudRepository" : ""}`);
  console.log(`Composes:    ${composed.join(", ") || "none"}`);
  console.log(`Methods:     ${methods.map((method) => method.name).join(", ") || "none"}`);
  console.log(`Inputs:      create=${args.createInput} update=${args.updateInput}`);
  console.log(`Fake:        ${fake.className} (${rel(cwd, fake.file)})`);
  console.log(`Shared:      ${sharedPackage}`);
  if (args.type === "custom" && isCrud) {
    console.log("\nNote: all five shared operations were composed, so CrudRepository is used.");
  }
  console.log("");

  if (args.dryRun) {
    for (const { file, content, kind } of writes) console.log(`--- ${kind} ${rel(cwd, file)}\n${content}`);
    notes.forEach((note) => console.log(note));
    console.log("\nDry run: nothing was written.");
    return;
  }

  for (const { file, content, kind, note } of writes) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log(`${kind === "+" ? "\x1b[32m+" : "\x1b[33m~"}\x1b[0m ${rel(cwd, file)}${note ? ` (${note})` : ""}`);
  }
  notes.forEach((note) => console.log(note));

  const markers = writes.filter(({ content }) => content.includes(MARKER)).map(({ file }) => rel(cwd, file));
  if (markers.length) {
    console.log(`\nResolve every "${MARKER}" marker in: ${markers.join(", ")}`);
  }
  console.log(
    `\nNext: node ${rel(cwd, path.join(path.dirname(new URL(import.meta.url).pathname), "verify-repository.mjs"))} ` +
      `--module ${args.module} ${args.aggregate ? `--aggregate ${args.aggregate}` : `--path ${args.path}`}` +
      (args.entity ? ` --entity ${args.entity}` : "") +
      (args.fakePath ? ` --fake-path ${args.fakePath}` : ""),
  );
}

main();
