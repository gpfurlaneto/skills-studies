---
name: shared-validation-rule
description: Cria regras de validação reutilizáveis no pacote compartilhado da aplicação, seguindo o padrão existente de contratos, utilitários, códigos de erro, exports e testes unitários completos.
---

# shared-validation-rule

Creates **one** reusable validation rule in `packages/shared/src/validation/rules`, together with its unit test and its export. The rule must look like it was written alongside the existing rules: same contract, same helpers, same error code style, same test style, and 100% coverage.

Scope: this skill only creates validation rules in the shared package. It never creates entities, use cases, controllers, or anything outside `packages/shared`.

## Contents of this skill

Everything the skill needs is inside this folder:

```
shared-validation-rule/
├── SKILL.md
├── agents/openai.yaml
├── scripts/
│   ├── scaffold-rule.mjs     # deterministic names, files, skeleton and export
│   └── verify-rule.mjs       # static checks, tsc, 100% coverage, full suite
├── references/
│   ├── contracts.md          # ValidationRule, ValidationField, Validator, rule.utils (+ helper table)
│   └── rule-catalog.md       # every existing rule: class, constructor, error code, helpers
└── examples/                 # few-shots: real rule + test pairs from the project
    ├── 01-required/          # no params, defines "empty"
    ├── 02-email/             # string, optional empty, manual guard
    ├── 03-min-length/        # one constructor param
    ├── 04-range-length/      # two constructor params
    ├── 05-strong-password/   # reuses validateStringValues, param with default
    └── 06-person-name/       # reuses validateStringValues with a module-level regex
```

## Inputs

Required. **If any of these is missing, ask the user for it and stop. Do not guess.**

1. **Rule name**, e.g. `has-emoji`, `HasEmoji` or `HasEmojiRule`. The script turns it into kebab-case.
2. **Validation goal**: what makes a value valid.
3. **Main value type**: `string` | `number` | `date` | `array` | `mixed`.
4. **Error code** returned on failure, e.g. `has.emoji`.

Optional:

5. **Parameters**, e.g. minimum, maximum, list of values, regex, or a behaviour flag, with types and defaults.
6. **Valid and invalid examples.** Every example the user gives becomes an assertion in the test.
7. **Empty handling**: `ignore` (default) or `reject`.

## Workflow

Run every command from the monorepo root.

### 1. Read the references (mandatory)

Read the live project files, which are the source of truth:

- `packages/shared/src/validation/validation-rule.interface.ts`
- `packages/shared/src/validation/validation-field.interface.ts`
- `packages/shared/src/validation/validator.ts`
- `packages/shared/src/validation/rule.utils.ts`
- `packages/shared/src/validation/index.ts`
- `packages/shared/src/validation/rules/index.ts`
- Rules: `required`, `email`, `min-length`, `range-length`, `strong-password`, `person-name` (`packages/shared/src/validation/rules/<name>.rule.ts`)
- Tests: `required.rule.test.ts`, `email.rule.test.ts`, `min-length.rule.test.ts`, `range-length.rule.test.ts`, `security-rules.test.ts`, `string-rules.test.ts` (`packages/shared/test/validation/rules/`)

Then read `references/contracts.md`, `references/rule-catalog.md` and the files in `examples/`. If a project file differs from the snapshot in this skill, follow the project.

### 2. Decide before writing

- **Does a rule already exist?** Check `references/rule-catalog.md` and `rules/index.ts`. If an existing rule (maybe with a parameter) already covers the goal, tell the user and stop instead of creating a duplicate.
- **Error code**: dot-case, consistent with the catalog (see "Error code conventions" there) and not used by another rule.
- **Helper** (choose in this order):

  | Type | Helper | Shape to copy |
  |---|---|---|
  | `string` | `validateStringValues` | `05-strong-password`, `06-person-name` |
  | `number` | `validateNumberValues` | `MinValueRule`, `RangeValueRule` (catalog) |
  | `date` | `validateDateValues` (+ `toValidDate` for date params) | `MinDateRule`, `FutureDateRule` (catalog) |
  | `array` (the array itself: size, uniqueness) | `isEmptyValue` + `Array.isArray` (+ `getComparableKey`) | `MinItemsRule`, `UniqueItemsRule` (catalog) |
  | `mixed` | `validateEachValue` (+ `getComparableKey`) | `InRule`, `EqualsRule` (catalog) |
  | length of string or array | `isEmptyValue` + `getValueLength` | `03-min-length`, `04-range-length` |

  Use `testPattern` whenever the regex can come from outside (a constructor param). A module-level regex constant without `g`/`y` flags can use `.test` directly, as `EmailRule` and `PersonNameRule` do.
- **New helper in `rule.utils.ts`**: only for logic that is generic, clearly reusable by other rules and not already covered by a helper. Never copy existing helper logic into a rule. If you add a helper, add its tests to `packages/shared/test/validation/rule.utils.test.ts` and later run verify with `--utils`. Say so in the final report.

### 3. Scaffold (deterministic)

```bash
node .claude/skills/shared-validation-rule/scripts/scaffold-rule.mjs \
  --name <rule-name> --code <error.code> --type <string|number|date|array|mixed> \
  [--param <name>:<type>[=<default>]]... [--empty ignore|reject]
```

Examples: `--param min:number`, `--param minLength:number=8`, `--param values:"readonly string[]"`. Use `--dry-run` to preview the output.

The script runs its preflight checks and writes nothing if any of them fails. It then creates:

- `packages/shared/src/validation/rules/<rule-name>.rule.ts`: imports, `<PascalCase>Rule implements ValidationRule`, constructor with `readonly` params, empty handling, type guard through the chosen helper.
- `packages/shared/test/validation/rules/<rule-name>.rule.test.ts`: `describe("<Class>")`, with the empty-value and invalid-type tests already filled in.
- `export * from "./<rule-name>.rule";` appended to `rules/index.ts`. It also makes sure `validation/index.ts` and `src/index.ts` export the chain. Existing exports are never touched.

Do not rename, move or reorder what the script generated.

### 4. Implement the rule

Replace the `TODO(shared-validation-rule)` marker in the rule file with the real logic:

- `validate(value: unknown): string | null` returns `null` when valid and **only the error suffix** when invalid. `Validator` builds `<field.code>.<errorCode>`.
- No `throw`, no side effects, no I/O, no mutation of `value` or of the rule state.
- Keep the error code as a string literal in the rule, as every existing rule does.
- Keep it short. Regex constants go at module level (`UPPER_SNAKE_CASE`). Derived state is computed once in the constructor (`MinDateRule`, `InRule`).
- Empty values: `ignore` returns `null` so `RequiredRule` handles required fields. `reject` is used only when the user asked for it explicitly.
- Formatting follows the existing files: double quotes, semicolons, 2-space indent, trailing commas in multi-line lists.

### 5. Write the tests

Replace the markers in the test file. Follow the examples: one `describe` per class, short `test("should ...")` blocks, a fresh `const rule = new XRule(...)` in each test, and `expect(rule.validate(x)).toBeNull()` / `.toBe("<code>")`.

The tests must cover:

- valid values, plus each user example,
- invalid values, plus each user example,
- boundaries: the last value that passes and the first that fails, for every limit,
- empty values (already generated: keep them),
- invalid types (already generated for typed rules: keep them, and add more if the rule has its own type logic),
- each parameter: at least two configurations, and the default value when there is one (`05-strong-password`),
- arrays of values when the helper checks each item: one fully valid array and one array with a single invalid item.

Test the rule's observable contract. Do not re-test `rule.utils` internals beyond what the rule exposes.

### 6. Verify

```bash
node .claude/skills/shared-validation-rule/scripts/verify-rule.mjs --name <rule-name> [--utils]
```

The script checks structure, markers, `throw` and exports, then runs `tsc --noEmit`. It runs the rule test with coverage limited to the rule file and fails below **100%** statements, branches, functions or lines. Last, it runs the full shared suite. If coverage is below 100%, read the uncovered lines in the report, add the missing cases to the test and run it again until it passes. Never lower the threshold or add `istanbul ignore`.

100% coverage is required, but it is not enough on its own. Istanbul marks each operand of `&&` / `||` as covered as soon as it runs, so `this.divisor !== 0 && item % this.divisor === 0` reaches 100% without any test where the divisor is `0`. Make sure every condition in the rule has at least one assertion where that condition alone makes the value fail.

### 7. Report

Report:

- class name and file,
- error code and the full error format (`<field.code>.<code>`),
- type, parameters and empty behaviour,
- helpers reused (and any helper added to `rule.utils.ts`, with the reason),
- files created and updated,
- the coverage line of the rule file,
- the result of the full suite.

## Few-shots

The real files are in `examples/`. Their shapes, in short:

**No params** (`01-required`):

```ts
import { ValidationRule } from "../validation-rule.interface";
import { isEmptyValue } from "../rule.utils";

export class RequiredRule implements ValidationRule {
  validate(value: unknown): string | null {
    return isEmptyValue(value) ? "required" : null;
  }
}
```

**String with optional empty** (`02-email`):

```ts
import { isEmptyValue } from "../rule.utils";
import { ValidationRule } from "../validation-rule.interface";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailRule implements ValidationRule {
  validate(value: unknown): string | null {
    if (isEmptyValue(value)) {
      return null;
    }

    if (typeof value !== "string") {
      return "invalid.email";
    }

    return EMAIL_REGEX.test(value.trim()) ? null : "invalid.email";
  }
}
```

**One param** (`03-min-length`):

```ts
import { getValueLength, isEmptyValue } from "../rule.utils";
import { ValidationRule } from "../validation-rule.interface";

export class MinLengthRule implements ValidationRule {
  constructor(readonly min: number) {}

  validate(value: unknown): string | null {
    if (isEmptyValue(value)) {
      return null;
    }

    const length = getValueLength(value);

    return length !== null && length >= this.min ? null : "min.length";
  }
}
```

**Two params** (`04-range-length`):

```ts
export class RangeLengthRule implements ValidationRule {
  constructor(
    readonly min: number,
    readonly max: number,
  ) {}

  validate(value: unknown): string | null {
    if (isEmptyValue(value)) {
      return null;
    }

    const length = getValueLength(value);

    return length !== null && length >= this.min && length <= this.max
      ? null
      : "range.length";
  }
}
```

**Reusing a generic helper** (`05-strong-password`). `validateStringValues` handles empty values, non-strings and arrays, so the rule only states what a valid item is:

```ts
import { validateStringValues } from "../rule.utils";
import { ValidationRule } from "../validation-rule.interface";

export class StrongPasswordRule implements ValidationRule {
  readonly minLength: number;

  constructor(minLength: number = 8) {
    this.minLength = minLength;
  }

  validate(value: unknown): string | null {
    return validateStringValues(value, "strong.password", (item) => {
      return (
        item.length >= this.minLength &&
        /[A-Z]/.test(item) &&
        /[a-z]/.test(item) &&
        /\d/.test(item) &&
        /[^A-Za-z0-9]/.test(item)
      );
    });
  }
}
```

**Test** (`03-min-length`):

```ts
import { MinLengthRule } from "../../../src/index";

describe("MinLengthRule", () => {
  test("should validate minimum string size", () => {
    const rule = new MinLengthRule(3);

    expect(rule.validate("ab")).toBe("min.length");
    expect(rule.validate("abc")).toBeNull();
  });

  test("should reject values without length and ignore empty", () => {
    const rule = new MinLengthRule(3);

    expect(rule.validate(10)).toBe("min.length");
    expect(rule.validate("")).toBeNull();
    expect(rule.validate(null)).toBeNull();
  });
});
```

## Updating the snapshots

When the validation core or the reference rules change in `packages/shared`, refresh this skill:

- copy the reference rule and test files into `examples/0N-<name>/` (`05-strong-password` and `06-person-name` keep their standalone tests, which are adapted from `security-rules.test.ts` and `string-rules.test.ts`),
- update `references/contracts.md` with the current interface, validator and `rule.utils.ts`,
- regenerate the table in `references/rule-catalog.md` from `rules/index.ts`.
