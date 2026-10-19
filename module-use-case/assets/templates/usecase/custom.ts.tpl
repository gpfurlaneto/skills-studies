{{contracts}}

export class {{name}} implements UseCase<{{name}}In, {{outType}}> {
{{#hasDeps}}
{{constructor}}

{{/hasDeps}}
  async execute(input: {{name}}In): Promise<{{outType}}> {
    // TODO(module-use-case): implement the flow the user described with the injected dependencies. Keep it minimal: no invented rules, no backend/HTTP/Prisma code.
  }
}
