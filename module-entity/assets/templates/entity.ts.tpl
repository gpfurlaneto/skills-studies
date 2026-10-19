import {
  Entity,
  EntityState,
  Validator,
} from "{{sharedPackage}}";

export interface {{pascal}}State extends EntityState {
{{stateFields}}
}

export class {{pascal}} extends Entity<{{pascal}}State> {
  constructor(props: {{pascal}}State) {
    super(props);
  }

{{getters}}

  validate(): void {
    Validator.validate([
{{validationFields}}
    ]);
  }
}
