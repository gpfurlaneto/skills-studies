{{contracts}}

export class {{name}} implements UseCase<{{name}}In, {{outType}}> {
{{constructor}}

  async execute(input: {{name}}In): Promise<{{outType}}> {
    const {{entityCamel}} = await this.{{repo}}.findById(input.id);

    if (!{{entityCamel}}) {
      throw new NotFoundError("{{code}}.not.found");
    }

    return {
{{outMapping}}
    };
  }
}
