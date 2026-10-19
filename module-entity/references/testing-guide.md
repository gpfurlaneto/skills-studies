# Entity testing guide

The unit test protects the behaviour of the entity, mostly `validate()`. It follows the style of `modules/auth/test/model/user.entity.test.ts` (snapshot in `examples/01-user/`) and must reach 100% statements, branches, functions and lines on the entity file.

## Location and imports

- File: `modules/<module>/test/<aggregate>/model/<entity>.entity.test.ts`. If a `<entity>.entity.test.ts` already exists elsewhere under `test/`, extend it instead of creating a second one (the scaffold script does this for you).
- Import the entity and its state from the module public entry, `src/index` (`"../../../src/index"` for a top-level aggregate). Never import from the entity file directly: the test also proves that the export chain works.
- Import `ValidationException` and helpers (`UuidRule`) from the shared package (`@poupig/shared`). Jest maps it to the shared sources.

## Fixed building blocks

Keep these exactly. The templates generate them.

```ts
const validProps: <Entity>State = { /* one realistic valid value per field, optional fields included */ };

function getErrorMessages(props: <Entity>State): string[] {
  const <entity> = new <Entity>(props);

  try {
    <entity>.validate();
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }

  return [];
}
```

Assert on the **full list** of messages with `toEqual([...])`, never with `toContain`. An empty list means valid. This catches both missing and unexpected errors and documents the order of `validate()`.

Values that break the TypeScript type (`undefined` for a required field, a string in a number field, an unknown union member) are passed with `as unknown as <Entity>State`. These cases matter because the entity is built from untyped form and request data.

## Required tests

| # | Test | What it proves |
|---|---|---|
| 1 | `should create a valid <entity> with base entity attributes` | every getter returns its prop (`toBe` against `validProps`), `id` is a UUID, `createdAt` is a `Date`, `updatedAt` equals `createdAt`, `deletedAt` is `null`, `validate()` does not throw |
| 2 | `should accept a <entity> without the optional fields` (only when there are optional fields) | optional getters return `undefined` and the entity is still valid |
| 3 | `should not validate the <entity> in the constructor` | construction with every field invalid does **not** throw, and `validate()` on the same data throws `ValidationException`. The word `constructor` must stay in the test name: `verify-entity.mjs` looks for it |
| 4 | `should keep the provided base attributes` | given `id`, `createdAt`, `updatedAt`, `deletedAt` are kept |
| 5 | `should update updatedAt when cloning` | `clone()` returns the same class, keeps `id` and `createdAt`, refreshes `updatedAt`, applies the change and keeps the other fields; the original is unchanged |
| 6 | `should validate the clone data only when validate is called` | an invalid clone is created without error and fails on `validate()` |
| 7 | `should report every invalid field at once` | one call with every field invalid returns the complete list of codes, in `validate()` order: no short-circuit, every field wired with the right code |
| 8 | one `describe("<field>")` per field | see below |

Add `should still validate the base id eagerly in the constructor` (`new X({ ...validProps, id: "abc" })` throws) when it helps document that only the entity's own fields are lazy.

## Per-field tests (`describe("<field>")`)

For each rule on the field:

- **Accepted values**: `test.each` with typical and edge valid values. For a union, iterate the exported values array (`test.each(TRANSACTION_TYPES)`).
- **Rejected values** with the exact codes, including every code that fires together (e.g. `NaN` on `[Positive, Precision]` gives both).
- **Boundaries**: for every limit, the last value that passes and the first that fails (`"a".repeat(120)` passes, `"a".repeat(121)` gives `max.length`; `RangeValueRule(1, 48)`: `1` and `48` pass, `0` and `49` fail).
- **Required fields**: empty string and whitespace (`""`, `"   "`) for strings, `undefined` for other types → `<entity>.<field>.required` only.
- **Optional fields**: `undefined`, `null` (when the type allows it) and `""` are accepted.
- **Type checks** when the rules check the type: a string in a number field, `NaN`, `new Date("invalid")`.
- **Arrays**: empty array, the size limit (last valid / first invalid), duplicates, and one invalid item among valid ones.

Keep test names in the `should ...` style. Test data must be realistic and deterministic: fixed ISO dates, fixed UUID v4 constants, no `Math.random()`. For `FutureDateRule`/`PastDateRule`, build dates relative to `Date.now()` with a wide margin (days, not milliseconds).

## 100% coverage is necessary, not sufficient

An entity built with the pattern has almost no branches, so coverage reaches 100% as soon as tests 1 and 3 run. Coverage alone proves nothing about the rules. Every rule in `validate()` must have at least one assertion where **that rule alone** makes the field fail, with its exact code. Read `validate()` rule by rule and check this before you finish.

If `validate()` has computed values or branches (a cross-field entry, a `?:`), every branch needs a passing and a failing assertion.

## Coverage commands

`scripts/verify-entity.mjs` runs them for you:

```bash
# from modules/<module>
npx jest --coverage --collectCoverageFrom=src/<aggregate>/model/<entity>.entity.ts \
  --coverageThreshold='{"global":{"statements":100,"branches":100,"functions":100,"lines":100}}' \
  --runTestsByPath test/<aggregate>/model/<entity>.entity.test.ts
npx jest --coverage   # full module suite
```

When coverage is below 100%, read the `Uncovered Line #s` column, add the missing case and run again. Never lower the threshold, never add `istanbul ignore`.
