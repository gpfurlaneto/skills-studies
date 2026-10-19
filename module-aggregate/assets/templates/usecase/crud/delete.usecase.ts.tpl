import { UseCase } from "{{sharedPackage}}";
import { {{pascal}}Repository } from "../provider";

export interface Delete{{pascal}}Input {
  id: string;
}

export class Delete{{pascal}} implements UseCase<Delete{{pascal}}Input, void> {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async execute(input: Delete{{pascal}}Input): Promise<void> {
    // TODO: check the {{pascal}} exists and delete it with the repository.
    throw new Error("Delete{{pascal}} is not implemented yet.");
  }
}
