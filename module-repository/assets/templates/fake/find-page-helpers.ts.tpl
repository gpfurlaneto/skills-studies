
function getFieldValue({{camel}}: {{pascal}}, field: string): unknown {
  return ({{camel}} as unknown as Record<string, unknown>)[field];
}

function compareValues(first: unknown, second: unknown): number {
  const firstValue = toComparable(first);
  const secondValue = toComparable(second);

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return firstValue - secondValue;
  }

  return String(firstValue).localeCompare(String(secondValue));
}

function toComparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : (value ?? "");
}
