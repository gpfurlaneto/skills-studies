import { UseCase } from "{{sharedPackage}}";
import { {{pascal}}Repository } from "../provider";

export interface Create{{pascal}}Input {
  // TODO: declare the data required to create a {{pascal}}.
}

export class Create{{pascal}} implements UseCase<Create{{pascal}}Input, void> {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async execute(input: Create{{pascal}}Input): Promise<void> {
    // TODO: build the {{pascal}}, call validate() and persist it with the repository.
    throw new Error("Create{{pascal}} is not implemented yet.");
  }
}
