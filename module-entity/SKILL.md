---
name: module-entity
description: Cria entidades de domínio padronizadas para os módulos da aplicação, com estado tipado, herança da entidade base, validação explícita orientada por regras reutilizáveis do projeto e testes unitários completos para garantir segurança de evolução.
---

# module-entity

Creates or completes **one domain entity** inside an existing business module in `modules/<module>`, together with its unit test. The entity follows the project pattern exactly: a typed `<Entity>State`, a class that extends the shared `Entity`, explicit getters and a manual, **lazy** `validate()` built only from shared validation rules. The test protects that behaviour and must reach **100% coverage** of the entity file.

Scope:

- Only the domain entity (`src/<aggregate>/model/<entity>.entity.ts`), its exports and its unit test (`test/<aggregate>/model/<entity>.entity.test.ts`).
- Never controllers, repositories, use cases, Prisma models, migrations or backend/frontend adapters.
- The only file allowed outside the module is a **new generic shared rule**, and only when the rules in section 4 allow it.

## Contents of this skill

Everything the skill needs is inside this folder:

```
module-entity/
├── SKILL.md
├── agents/openai.yaml
├── scripts/
│   ├── scaffold-entity.mjs       # validates module/aggregate, names, fields; writes entity + test skeletons and exports
│   └── verify-entity.mjs         # static pattern checks, tsc, 100% entity coverage, full module suite
├── assets/templates/
│   ├── entity.ts.tpl             # state interface, class, constructor, getters, validate() skeleton
│   └── entity.test.ts.tpl        # validProps, getErrorMessages, base/lazy/clone tests skeleton
├── references/
│   ├── rule-catalog.md           # every shared rule: constructor, error code, empty/type behaviour
│   ├── rule-inference.md         # how to pick rules from field type, field name and user rules
│   └── testing-guide.md          # required tests, per-field tests, coverage rules
└── examples/                     # few-shots, structural reference only
    ├── 01-user/                  # the real User entity of modules/auth and its test
    └── 02-transaction/           # number, money, union, date, uuid, array, optional fields
```

## Inputs

Required. **If any of these is missing, ask the user for it and stop. Do not guess.**

1. **Module**: folder name in `modules/`, e.g. `auth`.
2. **Aggregate**: the name of an existing aggregate (`user`) **or** a path inside `modules/<module>/src` (`billing/invoice`). A path is used as the destination even if it does not exist yet.
3. **Entity name**, in any casing: `transaction`, `OrderItem`, `order-item`.
4. **Fields with their types**, e.g. `description: string`, `amount: number`, `type: "income" | "expense"`, `notes?: string`. A `?` marks an optional field.

Optional:

5. **Explicit rules** for specific fields, e.g. "`description` max 60", "`code` must be uppercase". They win over the inferred rules (see `references/rule-inference.md`, section 4).

Do not declare `id`, `createdAt`, `updatedAt` or `deletedAt`: they come from `EntityState`.

## Non-negotiable pattern

```ts
import { /* shared rules, alphabetical */ Entity, EntityState, Validator } from "@poupig/shared";

export interface <Entity>State extends EntityState {
  <field>: <type>;
  <optional>?: <type>;
}

export class <Entity> extends Entity<<Entity>State> {
  constructor(props: <Entity>State) {
    super(props);
  }

  get <field>(): <type> {
    return this.props.<field>;
  }

  validate(): void {
    Validator.validate([
      {
        code: "<entityCamel>.<field>",
        value: this.<field>,
        rules: [new RequiredRule(), /* ... */],
      },
    ]);
  }
}
```

1. **Lazy validation is the central rule.** The constructor only calls `super(props)`. It never calls `validate()`, never transforms, normalizes or defaults the data. An entity must be able to exist in an invalid state (forms, drafts, partial updates in the frontend) until someone explicitly calls `validate()`. The base `Entity` constructor still validates `id` and the timestamps; that is shared behaviour and is not changed here.
2. One getter per state field, in declaration order, returning `this.props.<field>` with the declared type (`T | undefined` for optional fields). No setters, no logic in getters.
3. `validate()` holds the business rules: **one** `Validator.validate([...])` call with one entry per field, in declaration order, code `"<entityCamel>.<field>"` (`OrderItem.unitPrice` → `"orderItem.unitPrice"`), and a non-empty `rules` list.
4. Rules come from the shared package only. No local rule classes, no `if (...) throw` in the entity.
5. Literal unions are declared once as an exported `const` array plus a derived type, above the state interface (`references/rule-inference.md`, section 5). This is the only extra code allowed in the file.
6. Formatting follows the project: double quotes, semicolons, 2-space indent, trailing commas in multi-line lists, named imports in alphabetical order (multi-line when more than a few).

## Workflow

Run every command from the monorepo root.

### 1. Read the references (mandatory)

Live project files (the source of truth):

- `modules/auth/src/user/model/user.entity.ts`
- `modules/auth/test/user/model/user.entity.test.ts`. In the current project this test lives at `modules/auth/test/model/user.entity.test.ts`; read whichever exists.
- `packages/shared/src/model/entity.ts`
- `packages/shared/src/validation/validator.ts`
- `packages/shared/src/validation/index.ts`
- `packages/shared/src/validation/rules/` (`index.ts` and the rules you plan to use)

Then read `references/rule-catalog.md`, `references/rule-inference.md`, `references/testing-guide.md` and both `examples/`. If a live file differs from a snapshot in this skill, **follow the live file**.

### 2. Decide the rules before writing

For every field, write down the rule list using `references/rule-inference.md`:

1. required or optional → `RequiredRule` or not;
2. base rules from the type;
3. refinements from the name;
4. explicit user rules (they replace conflicting inferred ones);
5. if nothing fits, follow section 6 of the inference guide: combine shared rules, then `RegexRule` for a one-off format, and a **new shared rule** only when it is clearly generic and reusable by other modules. Cross-field business rules are reported to the user, not turned into shared rules.

When a choice is ambiguous, make the most reasonable inference from the project conventions instead of leaving the field unprotected, and list the choice in the report. Do not stack rules that add nothing (e.g. `MinLengthRule(1)` after `RequiredRule`) and do not invent strict business limits the field name does not suggest.

### 3. Scaffold

```bash
node .claude/skills/module-entity/scripts/scaffold-entity.mjs \
  --module <module> (--aggregate <name> | --aggregate-path <path>) \
  --entity <name> \
  --field "<name>:<type>" --field "<optional>?:<type>" ...   [--dry-run]
```

Quote each `--field` (types can contain spaces and `|`). Run it with `--dry-run` first and check the summary.

The script refuses to continue, and writes nothing, when the module does not exist (it lists the available ones), the aggregate name does not exist (it suggests `module-aggregate` or `--aggregate-path`), the module has no single `<scope>/shared` dependency, a name is invalid or reserved, a field repeats or redeclares a base field, or `<Entity>`/`<Entity>State` is already declared elsewhere in the module. Relay these errors to the user instead of working around them.

What it writes:

| Situation | Entity file | Test file |
|---|---|---|
| file missing | created from the template | created from the template |
| entity is the untouched `module-aggregate` placeholder | replaced by the template | created if missing |
| real entity already exists (**update mode**) | untouched; the script prints existing fields, fields to add, fields to review | the existing `<entity>.entity.test.ts` (anywhere under `test/`) is reused and left untouched |

It also appends the missing exports (`model/index.ts` → `<aggregate>/index.ts` → … → `src/index.ts`) without touching other lines.

### 4. Write the entity

- **New / placeholder**: replace every `TODO(module-entity)` marker in `validate()` with the rules decided in step 2, add the rule imports, and add union constants if needed. Adjust nothing else in the generated structure.
- **Update mode**: edit the existing file by hand following the same pattern. Add the new fields to `<Entity>State`, add their getters in the same order and their `validate()` entries. Review the requested existing fields, and keep fields the user did not mention. Never remove a field, rename a code or loosen an existing rule unless the user asked for it, because codes are a contract with the frontend and the tests.

### 5. Write the tests

Follow `references/testing-guide.md` and `examples/`. In short:

- fill `validProps` with realistic, deterministic values for every field (optional ones included);
- keep the generated base tests (valid entity and getters, lazy constructor, base attributes, `clone`, lazy clone, every-field-invalid) and fill their markers;
- add one `describe("<field>")` per field with accepted values, rejected values with the **exact** full message list, boundaries for every limit, required/optional behaviour and type checks;
- in update mode, extend the existing test for every added or changed field and make sure it still covers the required tests in the guide.

Every rule in `validate()` needs at least one assertion where that rule alone makes the field fail. 100% coverage of the entity alone does not prove this.

### 6. Verify

```bash
node .claude/skills/module-entity/scripts/verify-entity.mjs \
  --module <module> (--aggregate <name> | --aggregate-path <path>) --entity <name>
```

It checks that no `TODO` markers are left, the structure and lazy constructor, one getter and one `validate()` entry per field, the test import from `src/index`, the lazy-constructor test, and the export chain. It then runs `tsc --noEmit` on the module, the entity test with coverage limited to the entity file at a **100%** threshold for statements, branches, functions and lines, and the full module test suite with coverage.

If any step fails, fix the cause and run it again until everything passes. If coverage is below 100%, read the uncovered lines, add the missing tests and rerun. Never lower the threshold, never use `istanbul ignore`, never weaken a rule to make a test pass. If a new shared rule was created, also run the shared package tests (`npx jest --coverage` in `packages/shared`).

### 7. Report

- module, aggregate path, entity class, files created/updated (including export lines);
- a table of fields → rules → error codes, marking which rules were **inferred**, which came **from the user**, and any ambiguous choice;
- new shared rules (file, reason, tests), or "none";
- cross-field rules that were not implemented, if any;
- the coverage line of the entity file and the result of the full module suite.

## Few-shots

The full files are in `examples/`. They are structural references, not dependencies. Do not import or copy them into the project as they are.

**Entity with inferred rules** (`examples/02-transaction/transaction.entity.ts`, excerpt):

```ts
export const TRANSACTION_TYPES = ["income", "expense"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export interface TransactionState extends EntityState {
  description: string;
  amount: number;
  type: TransactionType;
  accountId: string;
  tags: string[];
  notes?: string;
}

export class Transaction extends Entity<TransactionState> {
  constructor(props: TransactionState) {
    super(props);
  }

  get amount(): number {
    return this.props.amount;
  }

  // ... one getter per field

  validate(): void {
    Validator.validate([
      {
        code: "transaction.description",
        value: this.description,
        rules: [new RequiredRule(), new MinLengthRule(3), new MaxLengthRule(120)],
      },
      {
        code: "transaction.amount",
        value: this.amount,
        rules: [new RequiredRule(), new PositiveRule(), new PrecisionRule(2)],
      },
      {
        code: "transaction.type",
        value: this.type,
        rules: [new RequiredRule(), new InRule(TRANSACTION_TYPES)],
      },
      {
        code: "transaction.accountId",
        value: this.accountId,
        rules: [new RequiredRule(), new UuidRule()],
      },
      {
        code: "transaction.tags",
        value: this.tags,
        rules: [new MaxItemsRule(10), new UniqueItemsRule(), new SlugRule()],
      },
      {
        code: "transaction.notes",
        value: this.notes,
        rules: [new MaxLengthRule(500)],
      },
    ]);
  }
}
```

**Tests** (`examples/02-transaction/transaction.entity.test.ts`, excerpt):

```ts
test("should not validate the transaction in the constructor", () => {
  const invalidProps = { description: "", amount: -1, type: "transfer" /* ... */ } as unknown as TransactionState;

  expect(() => new Transaction(invalidProps)).not.toThrow();
  expect(() => new Transaction(invalidProps).validate()).toThrow(ValidationException);
});

describe("amount", () => {
  test.each([0, -10])("should reject the non-positive amount %s", (amount) => {
    expect(getErrorMessages({ ...validProps, amount })).toEqual(["transaction.amount.positive"]);
  });

  test("should reject more than two decimal places", () => {
    expect(getErrorMessages({ ...validProps, amount: 10.555 })).toEqual(["transaction.amount.precision"]);
  });

  test.each([Number.NaN, "10"])("should reject the non-numeric amount %s", (amount) => {
    expect(getErrorMessages({ ...validProps, amount } as unknown as TransactionState)).toEqual([
      "transaction.amount.positive",
      "transaction.amount.precision",
    ]);
  });
});
```

## Updating the snapshots

When the base entity, the validator or the shared rules change, refresh this skill: copy the live `User` entity and its test into `examples/01-user/` (with the test import adjusted to `../../../src/index`), regenerate `references/rule-catalog.md` from `rules/index.ts`, update the templates if the pattern changed, and run the scaffold + verify flow on a throwaway aggregate to make sure `examples/02-transaction` still passes at 100%.
