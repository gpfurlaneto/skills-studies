import { UseCase } from "{{sharedPackage}}";
import { {{pascal}}Repository } from "../provider";

// Example use case that only shows the expected structure: an input contract, a class named
// after the action, dependencies injected through the constructor and a single execute().
// Rename it to the real action (e.g. `approve-{{kebab}}.usecase.ts` / `Approve{{pascal}}`) or delete it.

export interface Example{{pascal}}Input {
  // TODO: declare the data this use case needs.
}

export class Example{{pascal}} implements UseCase<Example{{pascal}}Input, void> {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async execute(input: Example{{pascal}}Input): Promise<void> {
    // TODO: implement the use case flow.
    throw new Error("Example{{pascal}} is not implemented yet.");
  }
}
