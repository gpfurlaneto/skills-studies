
  async create(data: Create{{pascal}}Data): Promise<{{pascal}}> {
    const {{camel}} = new {{pascal}}(data);

    if (this.{{plural}}.has({{camel}}.id)) {
      throw new Error(`{{code}}.already.exists: ${{{camel}}.id}`);
    }

    this.{{plural}}.set({{camel}}.id, {{camel}});
    return {{camel}};
  }
