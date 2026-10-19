
  async create({{camel}}: {{pascal}}): Promise<{{pascal}}> {
    if (this.{{plural}}.has({{camel}}.id)) {
      throw new Error(`{{code}}.already.exists: ${{{camel}}.id}`);
    }

    this.{{plural}}.set({{camel}}.id, {{camel}});
    return {{camel}};
  }
