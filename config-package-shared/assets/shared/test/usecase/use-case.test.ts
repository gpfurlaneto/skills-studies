import { UseCase } from "../../src/index";

interface CreateGreetingInput {
  name: string;
}

interface CreateGreetingOutput {
  message: string;
  normalizedName: string;
}

class CreateGreetingUseCase implements UseCase<
  CreateGreetingInput,
  CreateGreetingOutput
> {
  async execute(input: CreateGreetingInput): Promise<CreateGreetingOutput> {
    const normalizedName = input.name.trim();

    return {
      message: `Hello, ${normalizedName}!`,
      normalizedName,
    };
  }
}

describe("UseCase", () => {
  test("should allow creating a concrete use case with typed input and output", async () => {
    const useCase = new CreateGreetingUseCase();

    const output = await useCase.execute({
      name: "  Leonardo  ",
    });

    expect(output).toEqual({
      message: "Hello, Leonardo!",
      normalizedName: "Leonardo",
    });
  });
});
