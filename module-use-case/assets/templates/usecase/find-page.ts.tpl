{{imports}}

export interface {{name}}In extends PageRequest<{{pageArgs}}> {}

export interface {{name}}Item {
{{outFields}}
}

export interface {{name}}Out extends PageResult<{{name}}Item> {}

export class {{name}} implements UseCase<{{name}}In, {{outType}}> {
{{constructor}}

  async execute(input: {{name}}In): Promise<{{outType}}> {
    Validator.validate([
      {
        code: "page",
        value: input.page,
        rules: [new RequiredRule(), new IntegerRule(), new MinValueRule(1)],
      },
      {
        code: "pageSize",
        value: input.pageSize,
        rules: [new RequiredRule(), new IntegerRule(), new MinValueRule(1)],
      },
    ]);

    const result = await this.{{repo}}.findPage(input);

    return {
      ...result,
      items: result.items.map(({{entityCamel}}) => ({
{{outMapping}}
      })),
    };
  }
}
