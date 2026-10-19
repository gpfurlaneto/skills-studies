import { ClockProvider } from "../../src/index";

export class FakeClockProvider implements ClockProvider {
  constructor(private current = new Date("2024-01-01T00:00:00.000Z")) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}
