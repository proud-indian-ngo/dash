import { describe, expect, it, vi } from "vitest";
import { getEditionForUpdate } from "../kalakriti-row-locks";

describe("getEditionForUpdate", () => {
  it("normalizes Zero's numeric date-only value", async () => {
    const run = vi.fn().mockResolvedValue({
      eventDate: Date.UTC(2027, 10, 21),
      id: "edition-1",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    });

    await expect(
      getEditionForUpdate({ location: "client", run }, "edition-1")
    ).resolves.toEqual({
      eventDate: "2027-11-21",
      id: "edition-1",
      lifecycle: "draft",
      timezone: "Asia/Kolkata",
    });
  });
});
