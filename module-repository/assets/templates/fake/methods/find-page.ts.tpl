
  async findPage({
    page,
    pageSize,
    sort = [],
  }: PageRequest<{{pascal}}Filter>): Promise<PageResult<{{pascal}}>> {
    // The filter is ignored until {{pascal}}Filter declares fields.
    const items = this.items.sort((first, second) => {
      for (const { field, direction } of sort) {
        const result = compareValues(
          getFieldValue(first, field),
          getFieldValue(second, field),
        );

        if (result !== 0) {
          return direction === "asc" ? result : -result;
        }
      }

      return 0;
    });
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      page,
      pageSize,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / pageSize),
    };
  }
