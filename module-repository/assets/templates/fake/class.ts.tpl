{{imports}}

export class {{fakeClass}} implements {{pascal}}Repository {
  private readonly {{plural}} = new Map<string, {{pascal}}>();

  constructor({{plural}}: {{pascal}}[] = []) {
    {{plural}}.forEach(({{camel}}) => this.{{plural}}.set({{camel}}.id, {{camel}}));
  }

  get items(): {{pascal}}[] {
    return [...this.{{plural}}.values()];
  }
{{methods}}}
{{helpers}}