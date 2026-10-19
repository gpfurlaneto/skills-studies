import { Entity, EntityState } from "{{sharedPackage}}";

export interface {{pascal}}State extends EntityState {
  // TODO: declare the {{pascal}} attributes here.
}

export class {{pascal}} extends Entity<{{pascal}}State> {
  constructor(props: {{pascal}}State) {
    super(props);
  }

  // TODO: expose each attribute through a getter, e.g. `get name(): string { return this.props.name; }`.

  validate(): void {
    // TODO: validate the {{pascal}} attributes with Validator.validate([{ code: "{{code}}.<attribute>", value, rules }]).
  }
}
