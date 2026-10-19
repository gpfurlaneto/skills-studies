# Rule inference

How to choose the rules of each field in `validate()`. Use the field **type** to get the base rules, then the field **name** to refine them, then the explicit rules of the user, which always win. The limits in this file are defaults. Use them only when the user did not give a limit.

The goal: no field is left unprotected, every rule comes from the shared package, and the result is close to what a careful developer would write without being too strict.

## 1. Required or optional

| Declaration | Required? |
|---|---|
| `name: T` | yes → first rule is `new RequiredRule()` |
| `name?: T`, `name: T \| undefined`, `name: T \| null` | no → no `RequiredRule` |
| `name: boolean` | yes, but `RequiredRule` only catches `null`/`undefined`, so pair it with `InRule([true, false])` for the type |

Never add `RequiredRule` to an optional field "just in case". Optional means the other rules only run when a value is present, which is the behaviour of every non-presence rule.

## 2. Base rules by type

| Field type | Base rules (after `RequiredRule` when required) |
|---|---|
| `string` (free text) | `MaxLengthRule(n)` (see section 3 for `n`), plus `MinLengthRule(n)` when the name suggests a minimum |
| `number` | at least one number rule, so that the type is checked: `IntegerRule`, `PositiveRule`, `MinValueRule`, `MaxValueRule`, `RangeValueRule` or `PrecisionRule` |
| `boolean` | `InRule([true, false])` |
| `Date` | `DateRule` |
| `string` holding a date / time | `DateStringRule` / `TimeStringRule` |
| literal union / enum (`"a" \| "b"`, `enum X`) | `InRule(VALUES)` with a `const` array exported next to the entity (see section 5) |
| `string[]` | `MaxItemsRule(n)` (and `MinItemsRule(1)` + `RequiredRule` when at least one item is needed), plus a per-item format rule when the name gives one (`SlugRule` for tags, `UuidRule` for `*Ids`, `EmailRule` for `emails`) and `UniqueItemsRule` when duplicates make no sense |
| `number[]` | as `string[]`, with a per-item number rule |
| `<Union>[]` | `InRule(VALUES)` (it checks each item), plus the array rules |
| object / value object / nested entity | `RequiredRule` when required. Do not try to validate the inner fields here: they belong to their own entity or value object |

## 3. Refinements by field name

Match the name case-insensitively. The first matching row wins. Combine with the type rules above, never duplicate a rule.

| Name pattern | Rules (after `RequiredRule` when required) |
|---|---|
| `email`, `*Email` | `EmailRule` |
| person `name`, `fullName` (entity is a person: user, customer, employee, member, contact...) | `MinLengthRule(3)`, `MaxLengthRule(80)`, `PersonNameRule` (exactly as `User.name`) |
| `firstName`, `lastName`, `middleName` | `MinLengthRule(2)`, `MaxLengthRule(40)`. Not `PersonNameRule`, which requires at least two words |
| `name`, `title`, `label` of a thing (product, category, account...) | `MinLengthRule(2)` or `(3)`, `MaxLengthRule(80)` (titles: `120`) |
| `description`, `summary` | `MinLengthRule(3)`, `MaxLengthRule(255)` (long descriptions: `500`) |
| `notes`, `comment`, `observation`, `bio`, `message`, `content`, `body` | `MaxLengthRule(500)` (`content`/`body`: `5000`) |
| `password`, `passwordHash`, `hash` (stored in the entity) | `BcryptHashRule` only. Entities store hashes; plain-password strength (`StrongPasswordRule`...) belongs to the use case |
| `id` suffix (`userId`, `accountId`, `parentId`) | `UuidRule` |
| `ids` suffix (`tagIds`) | `UuidRule` (per item) + `UniqueItemsRule` |
| `slug`, `code`, `key`, `handle` | `SlugRule`, `MaxLengthRule(80)` |
| `url`, `website`, `link`, `*Url`, `avatar`, `image`, `photo` | `UrlRule` |
| `domain`, `host` | `DomainRule` |
| `color`, `*Color` | `HexColorRule` |
| `phone`, `cellphone`, `mobile`, `whatsapp` | `PhoneBrRule` when the project or the entity is clearly Brazilian (CPF, CEP, BRL...), otherwise `PhoneRule` |
| `cpf` / `cnpj` / `cep` / `rg` | `CpfRule` / `CnpjRule` / `CepRule` / `RgRule` |
| `zipCode`, `postalCode` | `CepRule` when Brazilian, otherwise `MaxLengthRule(20)` |
| `document`, `taxId` | `CpfRule` or `CnpjRule` when the type is known; if it can be either, `MaxLengthRule(20)` and say so in the report |
| `amount`, `price`, `value`, `total`, `balance`, `cost`, `fee` | `PrecisionRule(2)` + `PositiveRule` (`MinValueRule(0)` when zero is valid, e.g. `fee`, `discount`; no sign rule for `balance`, which can be negative) |
| `discount`, `tax` | `MinValueRule(0)`, `PrecisionRule(2)` |
| `percentage`, `percent`, `rate` | `RangeValueRule(0, 100)` (`rate` as a fraction: `RangeValueRule(0, 1)`), `PrecisionRule(2)` |
| `quantity`, `count`, `stock`, `installments`, `position`, `order`, `index` | `IntegerRule` + `MinValueRule(0)` (`installments`, `quantity` of an item: `PositiveRule` or a range such as `RangeValueRule(1, 48)`) |
| `age` | `IntegerRule`, `RangeValueRule(0, 150)` |
| `year` | `IntegerRule`, `RangeValueRule(1900, 2100)` |
| `month` / `day` | `IntegerRule`, `RangeValueRule(1, 12)` / `RangeValueRule(1, 31)` |
| `birthDate`, `dateOfBirth` | `DateRule`, `PastDateRule` (an age limit such as `AgeRule(18, 120)` only when the user asks) |
| `*At` / `*Date` (`paidAt`, `dueDate`, `occurredAt`) | `DateRule`. Do **not** add `FutureDateRule`/`PastDateRule` by default: they depend on "now", break when an entity is loaded later from the database, and make tests time-dependent. Add them only when the user asks |
| `startDate` + `endDate`, `startsAt` + `endsAt` | `DateRule` on both. The cross-field rule "end after start" has no shared rule: see section 6 |
| `tags`, `labels` | `MaxItemsRule(10)`, `UniqueItemsRule`, `SlugRule` |
| `status`, `type`, `kind`, `role`, `category` as a literal union | `InRule(VALUES)` |
| `is*`, `has*`, `active`, `enabled` (boolean) | `InRule([true, false])` |
| `currency` | `InRule(CURRENCIES)` when the values are known, otherwise `UpperCaseRule` + `RangeLengthRule(3, 3)` |
| `locale`, `language`, `timezone`, `country` | `MaxLengthRule(n)` (and `InRule` when the user lists the values) |
| `json`, `metadata`, `payload` as string | `JsonStringRule` |

When a field matches nothing, apply only the type rules. A `string` always gets at least a `MaxLengthRule` (default `255`) and a `number` always gets at least one number rule (default `MinValueRule(0)` unless the name suggests a sign), so no field is left without protection.

## 4. Explicit rules from the user

- The user's rules **replace** the inferred rules of that field when they conflict (other limit, other format) and are **added** to them when they do not conflict.
- If the user asks for a rule that exists in the shared package, use it. If the user asks for something generic that does not exist, follow section 6.
- Keep the user's limits exactly (`max 60` → `MaxLengthRule(60)`).

## 5. Literal unions and enums

Declare the allowed values once, next to the entity, above the state interface, and derive the type from them, so `InRule` and the type cannot drift apart:

```ts
export const TRANSACTION_TYPES = ["income", "expense"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
```

If the user passes a type that already exists in the module (an imported `enum` or `type`), import it and use `Object.values(MyEnum)` or the existing constant. Never re-declare it.

## 6. When no shared rule fits

In this order:

1. **A combination of shared rules** covers it (e.g. "between 3 and 80 characters" = `MinLengthRule(3)` + `MaxLengthRule(80)`, or `RangeLengthRule(3, 80)` when the user wants a single error code). Use it.
2. **`RegexRule`** covers a one-off format that only this entity needs. Use it with a module-level regex constant in the entity file.
3. **A new shared rule**, only when the check is **generic and reusable by other modules** (a common data format, a common numeric or date constraint). Create it with the `shared-validation-rule` skill if it is available. Otherwise follow the shared-package pattern by hand: `packages/shared/src/validation/rules/<name>.rule.ts`, export it from `rules/index.ts`, test it with 100% coverage in `packages/shared/test/validation/rules/<name>.rule.test.ts`, and run the shared test suite. Then use it in the entity. Name it in the final report.
4. **Business rules that involve more than one field** (e.g. `endDate` after `startDate`, `paidAt` only when `status === "paid"`) are not single-value rules. Do not create a shared rule for them. Validate each field with shared rules and tell the user that the cross-field rule is not covered. If the user explicitly asks for it, add it in `validate()` as an extra `Validator.validate` entry whose `value` is computed in the entity and whose rule is a shared rule. For example: `{ code: "<entity>.endDate", value: this.endDate >= this.startDate, rules: [new EqualsRule(true)] }`, which gives `<entity>.endDate.equals`. It must be covered by tests like every other branch.

Never write a local rule class or an `if/throw` inside the entity.
