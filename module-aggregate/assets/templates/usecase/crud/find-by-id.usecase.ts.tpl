import { UseCase } from "{{sharedPackage}}";
import { {{pascal}} } from "../model";
import { {{pascal}}Repository } from "../provider";

export interface Find{{pascal}}ByIdInput {
  id: string;
}

export class Find{{pascal}}ById implements UseCase<Find{{pascal}}ByIdInput, {{pascal}}> {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async execute(input: Find{{pascal}}ByIdInput): Promise<{{pascal}}> {
    // TODO: load the {{pascal}} with the repository and decide what happens when it does not exist.
    throw new Error("Find{{pascal}}ById is not implemented yet.");
  }
}
