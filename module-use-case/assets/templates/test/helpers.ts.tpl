{{testImports}}
{{#needsState}}

const validState: {{entity}}State = {
  // TODO(module-use-case): fill with values that pass {{entity}}.validate().
};

function make{{entity}}(overrides: Partial<{{entity}}State> = {}): {{entity}} {
  return new {{entity}}({ ...validState, ...overrides });
}
{{/needsState}}

{{makeSut}}
{{#needsErrors}}

async function getErrorMessages(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ValidationException) {
      return error.errors.map((item) => item.message);
    }

    throw error;
  }

  return [];
}
{{/needsErrors}}
