
  async delete(id: string): Promise<void> {
    if (!this.{{plural}}.delete(id)) {
      throw new NotFoundError(`{{code}}.not.found: ${id}`);
    }
  }
