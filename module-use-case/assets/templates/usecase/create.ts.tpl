{{contracts}}

export class {{name}} implements UseCase<{{name}}In, {{outType}}> {
{{constructor}}

  async execute(input: {{name}}In): Promise<{{outType}}> {
    const {{entityCamel}} = new {{entity}}({ ...input });

    {{entityCamel}}.validate();

{{#output}}
    const created = await this.{{repo}}.create({{entityCamel}});

    return {
{{outMapping}}
    };
{{/output}}
{{^output}}
    await this.{{repo}}.create({{entityCamel}});
{{/output}}
  }
}
