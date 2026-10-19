{{imports}}

function make{{pascal}}State(data: Partial<{{pascal}}State> = {}): {{pascal}}State {
  return {
{{sampleFields}}    ...data,
  };
}

function make{{pascal}}(data: Partial<{{pascal}}State> = {}): {{pascal}} {
  return new {{pascal}}(make{{pascal}}State(data));
}

describe("{{fakeClass}}", () => {
  test("should start with the provided {{pluralWords}}", () => {
    const {{camel}} = make{{pascal}}();

    expect(new {{fakeClass}}([{{camel}}]).items).toEqual([{{camel}}]);
    expect(new {{fakeClass}}().items).toEqual([]);
  });
{{cases}}});
