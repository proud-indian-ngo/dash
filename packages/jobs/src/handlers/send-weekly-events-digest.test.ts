import { describe, expect, it } from "vitest";
import { formatDigestMessage } from "../lib/weekly-events-digest";

describe("formatDigestMessage", () => {
  it("renders the weekly digest layout with descriptions and CTA", () => {
    const message = formatDigestMessage(
      [
        {
          name: "Community Outreach Drive",
          startTime: Date.UTC(2026, 3, 10, 11, 33),
          endTime: Date.UTC(2026, 3, 10, 13, 33),
          location: "Cubbon Park, Bangalore",
          description:
            "Community Outreach Drive — organized by the Events & Outreach team",
        },
        {
          name: "Bot Class",
          startTime: Date.UTC(2026, 3, 11, 13, 30),
          endTime: null,
          location: null,
          description: "Bot Class — organized by the Teaching team",
        },
      ],
      {
        ctaUrl: "https://dash.proudindian.ngo/events",
      }
    );

    expect(message).toBe(`*Upcoming Events This Week* 🌟

*Community Outreach Drive*
🗓️ Fri, April 10
⏰ 5:03pm - 7:03pm
📝 Community Outreach Drive — organized by the Events & Outreach team
📍 Cubbon Park, Bangalore

*Bot Class*
🗓️ Sat, April 11
⏰ 7pm onwards
📝 Bot Class — organized by the Teaching team

Interested? View events and register your interest:
https://dash.proudindian.ngo/events`);
  });
});
