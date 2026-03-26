import { describe, expect, it } from "vitest";
import {
  ISO_DATE,
  LONG_DATE,
  SHORT_DATE,
  SHORT_MONTH_DATE_TIME,
} from "./date-formats";

describe("date format constants", () => {
  it("exports expected format strings", () => {
    expect(SHORT_DATE).toBe("dd/MM/yyyy");
    expect(LONG_DATE).toBe("MMMM d, yyyy");
    expect(SHORT_MONTH_DATE_TIME).toBe("MMM d, yyyy h:mm a");
    expect(ISO_DATE).toBe("yyyy-MM-dd");
  });
});
