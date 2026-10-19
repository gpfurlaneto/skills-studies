{{contracts}}

export class {{name}} implements UseCase<{{name}}In, {{outType}}> {
{{constructor}}

  async execute(input: {{name}}In): Promise<{{outType}}> {
    const { id, ...data } = input;
    const current = await this.{{repo}}.findById(id);

    if (!current) {
      throw new NotFoundError("{{code}}.not.found");
    }

    const {{entityCamel}} = current.clone(data);

    {{entityCamel}}.validate();

{{#output}}
    const updated = await this.{{repo}}.update({{entityCamel}});

    return {
{{outMapping}}
    };
{{/output}}
{{^output}}
    await this.{{repo}}.update({{entityCamel}});
{{/output}}
  }
}
