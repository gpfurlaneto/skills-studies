
  async update(data: Update{{pascal}}Data): Promise<{{pascal}}> {
    const current = this.{{plural}}.get(data.id);

    if (!current) {
      throw new NotFoundError(`{{code}}.not.found: ${data.id}`);
    }

    const {{camel}} = current.clone(data);
    this.{{plural}}.set({{camel}}.id, {{camel}});
    return {{camel}};
  }
