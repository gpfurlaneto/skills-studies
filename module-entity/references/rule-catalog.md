# Shared validation rules (snapshot)

Snapshot of `packages/shared/src/validation/rules`, grouped by what an entity field needs. Check the live `rules/index.ts` before using it: if a rule was added or changed there, the project wins.

Every rule is imported from the shared package (`@poupig/shared`) and is used as `new XRule(...)` inside the `rules` list of a `Validator.validate` entry. `Validator` builds the error message as `<field.code>.<errorCode>`, e.g. `transaction.amount.positive`.

## Behaviour you must know before choosing rules

1. **Only `RequiredRule`, `NotNullRule` and `NotUndefinedRule` reject empty values.** Every other rule returns `null` for `null`, `undefined`, `""`, whitespace-only strings and `[]`. So:
   - required field → start with `new RequiredRule()`,
   - optional field → no `RequiredRule`; the other rules only run when a value is present.
2. **`RequiredRule` empty means:** `null`, `undefined`, a string that is empty after `trim()`, or `[]`. `0`, `false` and `Date` objects are **not** empty.
3. **String, number and date rules check each item when the value is an array** (`validateStringValues`, `validateNumberValues`, `validateDateValues`, `validateEachValue`). `new SlugRule()` on `string[]` validates every tag. `new InRule([...])` on an array validates every item.
4. **Length rules count items when the value is an array.** `MaxLengthRule(50)` on `string[]` limits the array size, not the length of each string. For arrays, use `MinItemsRule` and `MaxItemsRule` for the size. A per-item length limit needs a regex (`RegexRule`) or a new shared rule.
5. **Typed rules also check the type.** Number rules fail for non-numbers, `NaN` and `Infinity`. String rules fail for non-strings. Date rules accept `Date`, ISO strings and timestamps. `MinLengthRule` and `MaxLengthRule` accept anything with `length`, so they do **not** check that the value is a string.
6. Rules run in the order of the list and **every failing rule adds an error** (no short-circuit). `"Jo"` with `[Required, MinLength(3), PersonName]` produces `min.length` and `person.name`. Tests must expect every code.

## Presence

| Class | Constructor | Code | Notes |
|---|---|---|---|
| `RequiredRule` | — | `required` | rejects null/undefined/blank string/`[]` |
| `NotNullRule` | — | `not.null` | rejects only `null` |
| `NotUndefinedRule` | — | `not.undefined` | rejects only `undefined` |

## Strings: size and shape

| Class | Constructor | Code | Notes |
|---|---|---|---|
| `MinLengthRule` | `(min: number)` | `min.length` | string or array length |
| `MaxLengthRule` | `(max: number)` | `max.length` | string or array length |
| `RangeLengthRule` | `(min: number, max: number)` | `range.length` | one code for both limits |
| `TrimRule` | — | `trim` | no leading/trailing spaces |
| `NoWhitespaceRule` | — | `no.whitespace` | no whitespace at all |
| `AlphaRule` | — | `alpha` | letters only |
| `AlphaNumericRule` | — | `alpha.numeric` | letters and digits |
| `UpperCaseRule` | — | `upper.case` | |
| `LowerCaseRule` | — | `lower.case` | |
| `StartsWithRule` | `(prefix: string)` | `starts.with` | |
| `EndsWithRule` | `(suffix: string)` | `ends.with` | |
| `ContainsRule` | `(substring: string)` | `contains` | |
| `RegexRule` | `(pattern: RegExp \| string)` | `regex` | last resort for a format no rule covers |

## Strings: known formats

| Class | Constructor | Code | Typical fields |
|---|---|---|---|
| `EmailRule` | — | `invalid.email` | `email`, `*Email` |
| `PersonNameRule` | — | `person.name` | person `name`, `fullName`, `firstName` + `lastName` (needs at least two words) |
| `UuidRule` | — | `uuid` | `*Id` references (UUID v4) |
| `SlugRule` | — | `slug` | `slug`, `code`, `key`, tags (`lower-case-with-dashes`) |
| `UrlRule` | — | `url` | `url`, `website`, `*Url`, `avatar`, `link` |
| `DomainRule` | — | `domain` | `domain`, `host` |
| `HexColorRule` | — | `hex.color` | `color` |
| `JsonStringRule` | — | `json.string` | serialized JSON payloads |
| `DateStringRule` | — | `date.string` | dates kept as ISO `string` |
| `TimeStringRule` | — | `time.string` | times kept as `string` (`HH:mm[:ss]`) |
| `PhoneRule` | `(pattern: RegExp = E164)` | `phone` | international `phone` |
| `PhoneBrRule` | — | `phone.br` | Brazilian `phone`, `cellphone` |
| `CpfRule` | — | `cpf` | `cpf` |
| `CnpjRule` | — | `cnpj` | `cnpj` |
| `CepRule` | — | `cep` | `cep`, `zipCode` (BR) |
| `RgRule` | — | `rg` | `rg` |

## Strings: secrets

| Class | Constructor | Code | Notes |
|---|---|---|---|
| `BcryptHashRule` | — | `bcrypt.hash` | stored `password` / `passwordHash` in an entity |
| `StrongPasswordRule` | `(minLength = 8)` | `strong.password` | plain passwords: belongs to use cases, **not** to entities |
| `NoCommonPasswordRule` | `(blacklist?)` | `no.common.password` | plain passwords: use case |
| `NoRepeatCharsRule` | `(maxConsecutiveAllowed = 2)` | `no.repeat.chars` | |
| `HasUpperCaseRule` / `HasLowerCaseRule` / `HasNumberRule` / `HasSpecialCharRule` | — | `has.upper.case` / `has.lower.case` / `has.number` / `has.special.char` | |

## Numbers

| Class | Constructor | Code | Notes |
|---|---|---|---|
| `MinValueRule` | `(min: number)` | `min.value` | inclusive |
| `MaxValueRule` | `(max: number)` | `max.value` | inclusive |
| `RangeValueRule` | `(min: number, max: number)` | `range.value` | inclusive, one code for both limits |
| `IntegerRule` | — | `integer` | |
| `PositiveRule` | — | `positive` | `> 0` |
| `NegativeRule` | — | `negative` | `< 0` |
| `PrecisionRule` | `(maxDecimals: number)` | `precision` | money: `PrecisionRule(2)` |

There is no "non-negative" rule. Use `MinValueRule(0)`.

## Dates

| Class | Constructor | Code | Notes |
|---|---|---|---|
| `DateRule` | — | `invalid.date` | valid `Date` / ISO string / timestamp (rejects `new Date("invalid")`) |
| `MinDateRule` | `(minDate)` | `min.date` | fixed lower bound |
| `MaxDateRule` | `(maxDate)` | `max.date` | fixed upper bound |
| `DateRangeRule` | `(minDate, maxDate)` | `date.range` | |
| `FutureDateRule` | — | `future.date` | compares with "now" at validate time |
| `PastDateRule` | — | `past.date` | compares with "now" at validate time |
| `AgeRule` | `(min: number, max: number)` | `age.range` | `birthDate` |

## Arrays and sets of values

| Class | Constructor | Code | Notes |
|---|---|---|---|
| `MinItemsRule` | `(min: number)` | `min.items` | only runs on non-empty arrays: `[]` is empty, so pair with `RequiredRule` to require at least one item |
| `MaxItemsRule` | `(max: number)` | `max.items` | |
| `UniqueItemsRule` | — | `unique.items` | |
| `InRule` | `(values: readonly unknown[])` | `in` | enums, literal unions, booleans (`[true, false]`) |
| `NotInRule` | `(values: readonly unknown[])` | `not.in` | blocked values |
| `EqualsRule` | `(expectedValue: unknown)` | `equals` | |
| `NotEqualsRule` | `(blockedValue: unknown)` | `not.equals` | |
