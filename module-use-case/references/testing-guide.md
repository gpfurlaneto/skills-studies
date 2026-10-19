# Testing guide

The test is part of the delivery. It must cover **100% of the use case file** (statements, branches, functions and lines) by itself, and every case must assert observable behaviour.

## 1. Structure

Follow `modules/auth/test/user/usecase/register-user.usecase.test.ts`:

- import the use case and its contracts from the module `src/index` (`../../../src/index`), never from internal paths;
- import fakes from `test/mock` (its `index.ts`);
- a `makeSut(dep = new Fake(), ...)` function that builds the use case and returns it with its dependencies;
- `validState` / `validInput` constants with values that pass the entity `validate()` (read the entity rules and `packages/shared/src/validation/rules` for what each rule accepts);
- `getErrorMessages(promise)` to read the codes of a `ValidationException`;
- one `describe("<Name>")` with one `test` per flow; `test.each` for a list of invalid values.

## 2. What to cover

| Flow | Assert |
|---|---|
| Happy path | the returned value (`toEqual` with the full `Out`, or `resolves.toBeUndefined()`), and the effect on the fakes (stored item, changed fields, deleted item) |
| Validation failure | the **exact** error codes (`toEqual([...])`), and that nothing was persisted / the dependency was not called |
| Each branch (`if`, `??`, `?:`, early return) | one test per side |
| Not found | `NotFoundError` and its code |
| Dependency called / not called | through the fake state (`items`, `findById`) or a small subclass that counts calls |
| Propagated errors | a subclass of the fake that throws from the method, and `rejects.toThrow(...)` |

Avoid: tests that only assert "does not throw", snapshot tests, asserting private fields, depending on test order, real time (inject a clock provider fake when time matters).

## 3. Fakes

Search before creating. The scaffold already does it, but check by hand in update mode:

1. `modules/<module>/test/mock/index.ts` and every file it exports;
2. any `export class X implements <Interface>` in `modules/<module>/test/` (typical names: `fake-<aggregate>.repository.ts` / `Fake<Entity>Repository`, or `<aggregate>.repository.mock.ts` / `<Entity>RepositoryMock`).

Reuse the fake when it exists. Need a variation (failure, call counter, fixed value)? **Subclass it inside the test**:

```ts
class FailingUserRepository extends UserRepositoryMock {
  override async create(): Promise<never> {
    throw new Error("repository error");
  }
}
```

Create a fake only for an essential dependency that has none:

- one plain concrete class `implements <Interface>`, in `test/mock/`, named with the module convention, exported from `test/mock/index.ts`;
- deterministic, in-memory, no I/O, no randomness, no mock framework; small helpers for tests are fine (e.g. `set(date)` on a clock, `items` getter on a repository);
- repositories: a `Map` keyed by id, constructor accepting initial items and an `items` getter, the same shape as the existing repository fakes (or use the `module-repository` skill);
- if the fake has logic beyond returning stored values, give it its own small test next to it (`<fake>.test.ts`).

## 4. Coverage

`verify-usecase.mjs` runs only the use case test with coverage collected from the use case file and a 100% threshold. When it fails, the text report lists the uncovered lines: add the test for that flow. Never use `istanbul ignore`, lower the threshold or delete a test to pass.
