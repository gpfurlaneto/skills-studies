export interface Update{{pascal}}Data extends Partial<{{pascal}}State> {
  id: string;
  // TODO: adjust to the fields a caller may change when updating a {{pascal}}.
}
