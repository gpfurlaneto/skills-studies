import { PageRequest, PageResult, UseCase } from "{{sharedPackage}}";
import { {{pascal}} } from "../model";
import { {{pascal}}Filter, {{pascal}}Repository } from "../provider";

export type Find{{pascal}}PageInput = PageRequest<{{pascal}}Filter>;

export class Find{{pascal}}Page implements UseCase<Find{{pascal}}PageInput, PageResult<{{pascal}}>> {
  constructor(private readonly {{camel}}Repository: {{pascal}}Repository) {}

  async execute(input: Find{{pascal}}PageInput): Promise<PageResult<{{pascal}}>> {
    // TODO: validate the page request and load the page with the repository.
    throw new Error("Find{{pascal}}Page is not implemented yet.");
  }
}
