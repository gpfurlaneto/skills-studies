
  async findById(id: string): Promise<{{pascal}} | null> {
    return this.{{plural}}.get(id) ?? null;
  }
