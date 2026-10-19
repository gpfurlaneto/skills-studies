# Existing rule catalog (snapshot)

This is a snapshot of `packages/shared/src/validation/rules`, in the order of `rules/index.ts`. Use it to:

- avoid creating a rule that already exists (extend or reuse the existing one instead),
- pick an error code that is consistent with the existing codes and does not collide with them,
- find the closest existing rule to copy the shape from.

`scripts/scaffold-rule.mjs` checks the live project for name and error-code collisions, so this table is only a guide.

| Class | File | Constructor | Error code | `rule.utils` helpers |
|---|---|---|---|---|
| `RequiredRule` | `required.rule.ts` |  | `required` | isEmptyValue |
| `EmailRule` | `email.rule.ts` |  | `invalid.email` | isEmptyValue |
| `MinLengthRule` | `min-length.rule.ts` | `constructor(readonly min: number)` | `min.length` | getValueLength, isEmptyValue |
| `MaxLengthRule` | `max-length.rule.ts` | `constructor(readonly max: number)` | `max.length` | getValueLength, isEmptyValue |
| `RangeLengthRule` | `range-length.rule.ts` | `constructor(readonly min: number, readonly max: number)` | `range.length` | getValueLength, isEmptyValue |
| `DateRule` | `date.rule.ts` |  | `invalid.date` | isEmptyValue, toValidDate |
| `AgeRule` | `age.rule.ts` | `constructor(readonly min: number, readonly max: number)` | `age.range` | isEmptyValue, toValidDate |
| `TrimRule` | `trim.rule.ts` |  | `trim` | validateStringValues |
| `NoWhitespaceRule` | `no-whitespace.rule.ts` |  | `no.whitespace` | validateStringValues |
| `AlphaRule` | `alpha.rule.ts` |  | `alpha` | validateStringValues |
| `PersonNameRule` | `person-name.rule.ts` |  | `person.name` | validateStringValues |
| `AlphaNumericRule` | `alpha-numeric.rule.ts` |  | `alpha.numeric` | validateStringValues |
| `StartsWithRule` | `starts-with.rule.ts` | `constructor(readonly prefix: string)` | `starts.with` | validateStringValues |
| `EndsWithRule` | `ends-with.rule.ts` | `constructor(readonly suffix: string)` | `ends.with` | validateStringValues |
| `ContainsRule` | `contains.rule.ts` | `constructor(readonly substring: string)` | `contains` | validateStringValues |
| `RegexRule` | `regex.rule.ts` | `constructor(pattern: RegExp \| string)` | `regex` | testPattern, validateStringValues |
| `UpperCaseRule` | `upper-case.rule.ts` |  | `upper.case` | validateStringValues |
| `LowerCaseRule` | `lower-case.rule.ts` |  | `lower.case` | validateStringValues |
| `MinValueRule` | `min-value.rule.ts` | `constructor(readonly min: number)` | `min.value` | validateNumberValues |
| `MaxValueRule` | `max-value.rule.ts` | `constructor(readonly max: number)` | `max.value` | validateNumberValues |
| `RangeValueRule` | `range-value.rule.ts` | `constructor(readonly min: number, readonly max: number)` | `range.value` | validateNumberValues |
| `IntegerRule` | `integer.rule.ts` |  | `integer` | validateNumberValues |
| `PositiveRule` | `positive.rule.ts` |  | `positive` | validateNumberValues |
| `NegativeRule` | `negative.rule.ts` |  | `negative` | validateNumberValues |
| `PrecisionRule` | `precision.rule.ts` | `constructor(readonly maxDecimals: number)` | `precision` | validateNumberValues |
| `DateStringRule` | `date-string.rule.ts` |  | `date.string` | validateStringValues |
| `MinDateRule` | `min-date.rule.ts` | `constructor(minDate: Date \| number \| string)` | `min.date` | toValidDate, validateDateValues |
| `MaxDateRule` | `max-date.rule.ts` | `constructor(maxDate: Date \| number \| string)` | `max.date` | toValidDate, validateDateValues |
| `DateRangeRule` | `date-range.rule.ts` | `constructor(minDate: Date \| number \| string, maxDate: Date \| number \| string)` | `date.range` | toValidDate, validateDateValues |
| `FutureDateRule` | `future-date.rule.ts` |  | `future.date` | validateDateValues |
| `PastDateRule` | `past-date.rule.ts` |  | `past.date` | validateDateValues |
| `TimeStringRule` | `time-string.rule.ts` |  | `time.string` | validateStringValues |
| `UuidRule` | `uuid.rule.ts` |  | `uuid` | validateStringValues |
| `SlugRule` | `slug.rule.ts` |  | `slug` | validateStringValues |
| `HexColorRule` | `hex-color.rule.ts` |  | `hex.color` | validateStringValues |
| `JsonStringRule` | `json-string.rule.ts` |  | `json.string` | validateStringValues |
| `UrlRule` | `url.rule.ts` |  | `url` | validateStringValues |
| `PhoneRule` | `phone.rule.ts` | `constructor(pattern: RegExp = E164_PHONE_REGEX)` | `phone` | testPattern, validateStringValues |
| `DomainRule` | `domain.rule.ts` |  | `domain` | validateStringValues |
| `BcryptHashRule` | `bcrypt-hash.rule.ts` |  | `bcrypt.hash` | validateStringValues |
| `StrongPasswordRule` | `strong-password.rule.ts` | `constructor(minLength: number = 8)` | `strong.password` | validateStringValues |
| `NoCommonPasswordRule` | `no-common-password.rule.ts` | `constructor(blacklist: Iterable<string> = COMMON_PASSWORDS)` | `no.common.password` | validateStringValues |
| `NoRepeatCharsRule` | `no-repeat-chars.rule.ts` | `constructor(maxConsecutiveAllowed = 2)` | `no.repeat.chars` | validateStringValues |
| `HasUpperCaseRule` | `has-upper-case.rule.ts` |  | `has.upper.case` | validateStringValues |
| `HasLowerCaseRule` | `has-lower-case.rule.ts` |  | `has.lower.case` | validateStringValues |
| `HasNumberRule` | `has-number.rule.ts` |  | `has.number` | validateStringValues |
| `HasSpecialCharRule` | `has-special-char.rule.ts` |  | `has.special.char` | validateStringValues |
| `CpfRule` | `cpf.rule.ts` |  | `cpf` | validateStringValues |
| `CnpjRule` | `cnpj.rule.ts` |  | `cnpj` | validateStringValues |
| `CepRule` | `cep.rule.ts` |  | `cep` | validateStringValues |
| `PhoneBrRule` | `phone-br.rule.ts` |  | `phone.br` | validateStringValues |
| `RgRule` | `rg.rule.ts` |  | `rg` | validateStringValues |
| `MinItemsRule` | `min-items.rule.ts` | `constructor(readonly min: number)` | `min.items` | isEmptyValue |
| `MaxItemsRule` | `max-items.rule.ts` | `constructor(readonly max: number)` | `max.items` | isEmptyValue |
| `UniqueItemsRule` | `unique-items.rule.ts` |  | `unique.items` | getComparableKey, isEmptyValue |
| `InRule` | `in.rule.ts` | `constructor(values: readonly unknown[])` | `in` | getComparableKey, validateEachValue |
| `NotInRule` | `not-in.rule.ts` | `constructor(values: readonly unknown[])` | `not.in` | getComparableKey, validateEachValue |
| `NotNullRule` | `not-null.rule.ts` |  | `not.null` | — |
| `NotUndefinedRule` | `not-undefined.rule.ts` |  | `not.undefined` | — |
| `EqualsRule` | `equals.rule.ts` | `constructor(readonly expectedValue: unknown)` | `equals` | getComparableKey, validateEachValue |
| `NotEqualsRule` | `not-equals.rule.ts` | `constructor(readonly blockedValue: unknown)` | `not.equals` | getComparableKey, validateEachValue |

## Error code conventions

- Lowercase words separated by dots: `min.length`, `has.special.char`, `no.common.password`.
- Usually the rule name in dot-case (`StartsWithRule` → `starts.with`, `PhoneBrRule` → `phone.br`).
- Format or type checks with a generic name use the `invalid.` prefix: `invalid.email`, `invalid.date`.
- Range rules use `<subject>.range` or `range.<subject>`. Follow the closest existing rule (`range.length`, `range.value`, `date.range`, `age.range`).
- A rule returns **one** error code. It never builds codes dynamically.
