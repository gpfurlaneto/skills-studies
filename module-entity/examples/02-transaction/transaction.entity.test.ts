import { UuidRule, ValidationException } from "@poupig/shared";
import {
  TRANSACTION_TYPES,
  Transaction,
  TransactionState,
} from "../../../src/index";

const ACCOUNT_ID = "3f1d2c4b-5a6e-4f70-8b9c-0d1e2f3a4b5c";

const validProps: TransactionState = {
  description: "Grocery shopping",
  amount: 150.75,
  type: "expense",
  occurredAt: new Date("2024-05-10T12:00:00.000Z"),
  installments: 1,
  accountId: ACCOUNT_ID,
  tags: ["food", "home-supplies"],
  notes: "Paid with debit card",
  paidAt: new Date("2024-05-10T12:05:00.000Z"),
};

function getErrorMessages(props: TransactionState): string[] {
  const transaction = new Transaction(props);

  try {
    transaction.validate();
  } catch (error) {
    return (error as ValidationException).errors.map((item) => item.message);
  }

  return [];
}

describe("Transaction", () => {
  test("should create a valid transaction with base entity attributes", () => {
    const transaction = new Transaction(validProps);

    expect(transaction.description).toBe(validProps.description);
    expect(transaction.amount).toBe(validProps.amount);
    expect(transaction.type).toBe(validProps.type);
    expect(transaction.occurredAt).toBe(validProps.occurredAt);
    expect(transaction.installments).toBe(validProps.installments);
    expect(transaction.accountId).toBe(validProps.accountId);
    expect(transaction.tags).toBe(validProps.tags);
    expect(transaction.notes).toBe(validProps.notes);
    expect(transaction.paidAt).toBe(validProps.paidAt);
    expect(new UuidRule().validate(transaction.id)).toBeNull();
    expect(transaction.createdAt).toBeInstanceOf(Date);
    expect(transaction.updatedAt.getTime()).toBe(
      transaction.createdAt.getTime(),
    );
    expect(transaction.deletedAt).toBeNull();
    expect(() => transaction.validate()).not.toThrow();
  });

  test("should accept a transaction without the optional fields", () => {
    const { notes, paidAt, ...required } = validProps;
    const transaction = new Transaction(required);

    expect(transaction.notes).toBeUndefined();
    expect(transaction.paidAt).toBeUndefined();
    expect(() => transaction.validate()).not.toThrow();
  });

  test("should not validate the transaction in the constructor", () => {
    const invalidProps = {
      description: "",
      amount: -1,
      type: "transfer",
      occurredAt: new Date("invalid"),
      installments: 0,
      accountId: "abc",
      tags: ["Not Slug"],
      notes: "a".repeat(501),
      paidAt: new Date("invalid"),
    } as unknown as TransactionState;

    expect(() => new Transaction(invalidProps)).not.toThrow();
    expect(() => new Transaction(invalidProps).validate()).toThrow(
      ValidationException,
    );
  });

  test("should still validate the base id eagerly in the constructor", () => {
    expect(() => new Transaction({ ...validProps, id: "abc" })).toThrow(
      ValidationException,
    );
  });

  test("should keep the provided base attributes", () => {
    const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    const createdAt = new Date("2024-01-01T10:00:00.000Z");
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");
    const deletedAt = new Date("2024-01-03T10:00:00.000Z");
    const transaction = new Transaction({
      ...validProps,
      id,
      createdAt,
      updatedAt,
      deletedAt,
    });

    expect(transaction.id).toBe(id);
    expect(transaction.createdAt.getTime()).toBe(createdAt.getTime());
    expect(transaction.updatedAt.getTime()).toBe(updatedAt.getTime());
    expect(transaction.deletedAt?.getTime()).toBe(deletedAt.getTime());
  });

  test("should update updatedAt when cloning", () => {
    const updatedAt = new Date("2024-01-02T10:00:00.000Z");
    const transaction = new Transaction({ ...validProps, updatedAt });

    const cloned = transaction.clone({ amount: 99.9 });

    expect(cloned).toBeInstanceOf(Transaction);
    expect(cloned.id).toBe(transaction.id);
    expect(cloned.createdAt.getTime()).toBe(transaction.createdAt.getTime());
    expect(cloned.updatedAt.getTime()).toBeGreaterThan(updatedAt.getTime());
    expect(cloned.amount).toBe(99.9);
    expect(cloned.description).toBe(transaction.description);
    expect(transaction.amount).toBe(validProps.amount);
  });

  test("should validate the clone data only when validate is called", () => {
    const transaction = new Transaction(validProps);

    const cloned = transaction.clone({ amount: 0 });

    expect(() => cloned.validate()).toThrow(ValidationException);
  });

  test("should report every invalid field at once", () => {
    expect(
      getErrorMessages({
        description: "",
        amount: -1.555,
        type: "transfer",
        occurredAt: new Date("invalid"),
        installments: 0.5,
        accountId: "abc",
        tags: ["Not Slug", "Not Slug"],
        notes: "a".repeat(501),
        paidAt: new Date("invalid"),
      } as unknown as TransactionState),
    ).toEqual([
      "transaction.description.required",
      "transaction.amount.positive",
      "transaction.amount.precision",
      "transaction.type.in",
      "transaction.occurredAt.invalid.date",
      "transaction.installments.integer",
      "transaction.installments.range.value",
      "transaction.accountId.uuid",
      "transaction.tags.unique.items",
      "transaction.tags.slug",
      "transaction.notes.max.length",
      "transaction.paidAt.invalid.date",
    ]);
  });

  describe("description", () => {
    test.each(["", "   "])("should require the description '%s'", (description) => {
      expect(getErrorMessages({ ...validProps, description })).toEqual([
        "transaction.description.required",
      ]);
    });

    test("should validate the description minimum length", () => {
      expect(getErrorMessages({ ...validProps, description: "ab" })).toEqual([
        "transaction.description.min.length",
      ]);
      expect(getErrorMessages({ ...validProps, description: "abc" })).toEqual(
        [],
      );
    });

    test("should validate the description maximum length", () => {
      expect(
        getErrorMessages({ ...validProps, description: "a".repeat(121) }),
      ).toEqual(["transaction.description.max.length"]);
      expect(
        getErrorMessages({ ...validProps, description: "a".repeat(120) }),
      ).toEqual([]);
    });
  });

  describe("amount", () => {
    test.each([0.01, 10, 10.5, 1_000_000.99])(
      "should accept the amount %s",
      (amount) => {
        expect(getErrorMessages({ ...validProps, amount })).toEqual([]);
      },
    );

    test("should require the amount", () => {
      expect(
        getErrorMessages({
          ...validProps,
          amount: undefined,
        } as unknown as TransactionState),
      ).toEqual(["transaction.amount.required"]);
    });

    test.each([0, -10])("should reject the non-positive amount %s", (amount) => {
      expect(getErrorMessages({ ...validProps, amount })).toEqual([
        "transaction.amount.positive",
      ]);
    });

    test("should reject more than two decimal places", () => {
      expect(getErrorMessages({ ...validProps, amount: 10.555 })).toEqual([
        "transaction.amount.precision",
      ]);
    });

    test.each([Number.NaN, "10"])(
      "should reject the non-numeric amount %s",
      (amount) => {
        expect(
          getErrorMessages({
            ...validProps,
            amount,
          } as unknown as TransactionState),
        ).toEqual(["transaction.amount.positive", "transaction.amount.precision"]);
      },
    );
  });

  describe("type", () => {
    test.each(TRANSACTION_TYPES)("should accept the type %s", (type) => {
      expect(getErrorMessages({ ...validProps, type })).toEqual([]);
    });

    test("should require the type", () => {
      expect(
        getErrorMessages({
          ...validProps,
          type: "",
        } as unknown as TransactionState),
      ).toEqual(["transaction.type.required"]);
    });

    test.each(["transfer", "INCOME"])("should reject the type %s", (type) => {
      expect(
        getErrorMessages({
          ...validProps,
          type,
        } as unknown as TransactionState),
      ).toEqual(["transaction.type.in"]);
    });
  });

  describe("occurredAt", () => {
    test("should require the occurrence date", () => {
      expect(
        getErrorMessages({
          ...validProps,
          occurredAt: undefined,
        } as unknown as TransactionState),
      ).toEqual(["transaction.occurredAt.required"]);
    });

    test("should reject an invalid occurrence date", () => {
      expect(
        getErrorMessages({ ...validProps, occurredAt: new Date("invalid") }),
      ).toEqual(["transaction.occurredAt.invalid.date"]);
    });
  });

  describe("installments", () => {
    test.each([1, 12, 48])("should accept %s installments", (installments) => {
      expect(getErrorMessages({ ...validProps, installments })).toEqual([]);
    });

    test("should require the installments", () => {
      expect(
        getErrorMessages({
          ...validProps,
          installments: undefined,
        } as unknown as TransactionState),
      ).toEqual(["transaction.installments.required"]);
    });

    test.each([0, 49])(
      "should reject %s installments as out of range",
      (installments) => {
        expect(getErrorMessages({ ...validProps, installments })).toEqual([
          "transaction.installments.range.value",
        ]);
      },
    );

    test("should reject fractional installments", () => {
      expect(getErrorMessages({ ...validProps, installments: 1.5 })).toEqual([
        "transaction.installments.integer",
      ]);
    });
  });

  describe("accountId", () => {
    test("should require the account id", () => {
      expect(getErrorMessages({ ...validProps, accountId: "" })).toEqual([
        "transaction.accountId.required",
      ]);
    });

    test.each(["abc", "3f1d2c4b-5a6e-1f70-8b9c-0d1e2f3a4b5c"])(
      "should reject the account id %s",
      (accountId) => {
        expect(getErrorMessages({ ...validProps, accountId })).toEqual([
          "transaction.accountId.uuid",
        ]);
      },
    );
  });

  describe("tags", () => {
    test("should accept no tags", () => {
      expect(getErrorMessages({ ...validProps, tags: [] })).toEqual([]);
    });

    test("should validate the maximum number of tags", () => {
      const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);

      expect(getErrorMessages({ ...validProps, tags })).toEqual([
        "transaction.tags.max.items",
      ]);
      expect(
        getErrorMessages({ ...validProps, tags: tags.slice(0, 10) }),
      ).toEqual([]);
    });

    test("should reject duplicated tags", () => {
      expect(
        getErrorMessages({ ...validProps, tags: ["food", "food"] }),
      ).toEqual(["transaction.tags.unique.items"]);
    });

    test.each(["Food", "home supplies", "food-"])(
      "should reject the tag '%s'",
      (tag) => {
        expect(
          getErrorMessages({ ...validProps, tags: ["food-2", tag] }),
        ).toEqual(["transaction.tags.slug"]);
      },
    );
  });

  describe("notes", () => {
    test.each([undefined, "", "a".repeat(500)])(
      "should accept the notes %s",
      (notes) => {
        expect(getErrorMessages({ ...validProps, notes })).toEqual([]);
      },
    );

    test("should validate the notes maximum length", () => {
      expect(
        getErrorMessages({ ...validProps, notes: "a".repeat(501) }),
      ).toEqual(["transaction.notes.max.length"]);
    });
  });

  describe("paidAt", () => {
    test.each([undefined, null, new Date("2024-05-11T00:00:00.000Z")])(
      "should accept the payment date %s",
      (paidAt) => {
        expect(getErrorMessages({ ...validProps, paidAt })).toEqual([]);
      },
    );

    test("should reject an invalid payment date", () => {
      expect(
        getErrorMessages({ ...validProps, paidAt: new Date("invalid") }),
      ).toEqual(["transaction.paidAt.invalid.date"]);
    });
  });
});
