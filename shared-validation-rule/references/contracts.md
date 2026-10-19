# Validation contracts (snapshot)

This file is a snapshot of the validation core from `packages/shared/src/validation`. It explains the contract every rule must satisfy. **The project files are the source of truth.** Read them before you write a rule, and if they disagree with this snapshot, follow the project.

## `validation-rule.interface.ts`

```ts
export interface ValidationRule<T = unknown> {
  validate(value: T): string | null;
}
```

## `validation-field.interface.ts`

```ts
import { ValidationRule } from "./validation-rule.interface";

export interface ValidationField {
  code: string;
  value: unknown;
  rules: ValidationRule[];
}
```

## `validator.ts`: how the error code becomes a full error

```ts
import { ValidationException } from "../error/validation.exception";
import { ValidationError } from "../error/validation.error";
import { ValidationField } from "./validation-field.interface";

export class Validator {
  static validate(fields: ValidationField[]): void {
    const errors: ValidationError[] = [];

    for (const field of fields) {
      for (const rule of field.rules) {
        const errorCode = rule.validate(field.value);
        if (errorCode !== null) {
          errors.push(new ValidationError(`${field.code}.${errorCode}`));
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationException(errors);
    }
  }
}
```

Consequences for a rule:

- The rule returns only the **suffix** (`"min.length"`). The `Validator` prefixes it with the field code (`"user.name.min.length"`).
- The `Validator` runs every rule of a field, so a rule never needs to know about other rules. Each rule checks one thing.
- The `Validator` collects errors and throws. A rule never throws.

## `rule.utils.ts`: helpers to reuse

```ts
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

export function getValueLength(value: unknown): number | null {
  if (typeof value === "string" || Array.isArray(value)) {
    return value.length;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "length" in value &&
    typeof value.length === "number"
  ) {
    return value.length;
  }

  return null;
}

export function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeRuleValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

export function validateEachValue(
  value: unknown,
  errorCode: string,
  predicate: (item: unknown) => boolean,
): string | null {
  if (isEmptyValue(value)) {
    return null;
  }

  return normalizeRuleValues(value).every(predicate) ? null : errorCode;
}

export function validateStringValues(
  value: unknown,
  errorCode: string,
  predicate: (item: string) => boolean,
): string | null {
  return validateEachValue(
    value,
    errorCode,
    (item) => typeof item === "string" && predicate(item),
  );
}

export function validateNumberValues(
  value: unknown,
  errorCode: string,
  predicate: (item: number) => boolean,
): string | null {
  return validateEachValue(
    value,
    errorCode,
    (item) => typeof item === "number" && Number.isFinite(item) && predicate(item),
  );
}

export function validateDateValues(
  value: unknown,
  errorCode: string,
  predicate: (item: Date) => boolean,
): string | null {
  return validateEachValue(value, errorCode, (item) => {
    const date = toValidDate(item);

    return date !== null && predicate(date);
  });
}

export function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;

  return pattern.test(value);
}

export function getComparableKey(value: unknown): string {
  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }

  if (typeof value === "number" && Number.isNaN(value)) {
    return "number:NaN";
  }

  if (typeof value === "object" && value !== null) {
    try {
      return `object:${JSON.stringify(value)}`;
    } catch {
      return `object:${String(value)}`;
    }
  }

  return `${typeof value}:${String(value)}`;
}
```

### What each helper gives you for free

| Helper | Empty value (`null`, `undefined`, blank string, `[]`) | Array input | Wrong type | Use it for |
|---|---|---|---|---|
| `validateStringValues` | `null` (ignored) | checks every item | error code | any check on string content |
| `validateNumberValues` | `null` (ignored) | checks every item | error code (also `NaN`/`Infinity`) | any check on numeric value |
| `validateDateValues` | `null` (ignored) | checks every item | error code (also unparsable date) | any check on a `Date`, ISO string or timestamp |
| `validateEachValue` | `null` (ignored) | checks every item | your predicate decides | mixed types, or comparisons through `getComparableKey` |
| `isEmptyValue` | — | — | — | manual guard when no `validate*Values` helper fits (length or array rules) |
| `getValueLength` | — | — | `null` | length of string, array or `{ length: number }` |
| `toValidDate` | — | — | `null` | parsing dates in constructors or manual rules |
| `testPattern` | — | — | — | testing a `RegExp` that may come from outside (it resets `lastIndex` for `g`/`y` flags) |
| `getComparableKey` | — | — | — | comparing by value (sets, equality, uniqueness) |

Note the array behaviour: `validate*Values` treats an array as a list of values and checks **each item**. That is how `TrimRule`, `StartsWithRule`, `MinValueRule` and others accept `["a", "b"]`. A rule that is about the **array itself** (number of items, uniqueness) must not use these helpers. Use `isEmptyValue` + `Array.isArray`, the same way `MinItemsRule` and `UniqueItemsRule` do.

## Export chain

```
src/index.ts                 export * from "./validation";
src/validation/index.ts      export * from "./rules";
src/validation/rules/index.ts  export * from "./<rule-name>.rule";   <- the only file you edit
```

Tests always import from `"../../../src/index"`, which proves that the rule is reachable through the whole chain.
