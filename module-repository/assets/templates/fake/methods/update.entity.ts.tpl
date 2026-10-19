
  async update({{camel}}: {{pascal}}): Promise<{{pascal}}> {
    if (!this.{{plural}}.has({{camel}}.id)) {
      throw new NotFoundError(`{{code}}.not.found: ${{{camel}}.id}`);
    }

    this.{{plural}}.set({{camel}}.id, {{camel}});
    return {{camel}};
  }
