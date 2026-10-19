import {
  DomainError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ValidationException,
} from "../src/index";

describe("shared errors", () => {
  test("should create the base error with default status code", () => {
    const error = new DomainError("Domain error");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe("DomainError");
    expect(error.message).toBe("Domain error");
    expect(error.statusCode).toBe(500);
  });

  test("should create ValidationError with status 422", () => {
    const error = new ValidationError("user.email.invalid.email");

    expect(error).toBeInstanceOf(DomainError);
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe("user.email.invalid.email");
  });

  test("should create NotFoundError with status 404", () => {
    const error = new NotFoundError("Resource not found");

    expect(error).toBeInstanceOf(DomainError);
    expect(error.statusCode).toBe(404);
  });

  test("should create UnauthorizedError with status 401", () => {
    const error = new UnauthorizedError("Not authorized");

    expect(error).toBeInstanceOf(DomainError);
    expect(error.statusCode).toBe(401);
  });

  test("should create ValidationException with complete error list", () => {
    const errors = [
      new ValidationError("user.email.invalid.email"),
      new ValidationError("user.name.min.length"),
    ];
    const error = new ValidationException(errors);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.statusCode).toBe(422);
    expect(error.errors).toEqual(errors);
  });
});
