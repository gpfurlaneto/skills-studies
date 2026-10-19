import { UseCase } from "{{sharedPackage}}";
import { {{pascal}}Repository } from "../provider";

export interface Update{{pascal}}Input {
  id: string;
  // TODO: declare the data that can be updated on a {{pascal}}.
}

export class Update{{pascal}} implements UseCase<Update{{pascal}}Input, void> {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async execute(input: Update{{pascal}}Input): Promise<void> {
    // TODO: load the {{pascal}}, apply the changes, call validate() and persist it with the repository.
    throw new Error("Update{{pascal}} is not implemented yet.");
  }
}
