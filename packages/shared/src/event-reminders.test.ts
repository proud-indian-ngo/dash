import { describe, expect, it } from "vitest";
import { formatReminderInterval } from "./event-reminders";

describe("formatReminderInterval", () => {
  it("returns minutes for values under 60", () => {
    expect(formatReminderInterval(30)).toBe("30 min");
    expect(formatReminderInterval(1)).toBe("1 min");
  });

  it("returns hours for values 60-1439", () => {
    expect(formatReminderInterval(60)).toBe("1 hour");
    expect(formatReminderInterval(120)).toBe("2 hours");
  });

  it("returns days for values 1440-10079", () => {
    expect(formatReminderInterval(1440)).toBe("1 day");
    expect(formatReminderInterval(4320)).toBe("3 days");
  });

  it("returns weeks for values >= 10080", () => {
    expect(formatReminderInterval(10_080)).toBe("1 week");
    expect(formatReminderInterval(20_160)).toBe("2 weeks");
  });
});
