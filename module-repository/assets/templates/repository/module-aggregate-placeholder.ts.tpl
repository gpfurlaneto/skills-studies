import { CrudRepository } from "{{sharedPackage}}";
import { {{pascal}} } from "../model";

export interface {{pascal}}Filter {
  // TODO: declare the fields used to filter a {{pascal}} page.
}

export interface {{pascal}}Repository extends CrudRepository<
  {{pascal}},
  {{pascal}},
  {{pascal}},
  {{pascal}}Filter
> {}
