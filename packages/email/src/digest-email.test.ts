import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/server", () => ({
  env: { APP_NAME: "PI", APP_URL: "https://dash.test" },
}));

import { FOOTER_NOTE_PLACEHOLDER, renderNotificationDigestEmail } from ".";

describe("renderNotificationDigestEmail", () => {
  it("renders rows, escapes their text and keeps the per-recipient footer slot", async () => {
    const html = await renderNotificationDigestEmail({
      cta: { label: "Review vendor payments", url: "https://dash.test/vp" },
      heading: "New invoice (2)",
      intro: "From Requests · Pending approvals.",
      moreCount: 3,
      preview: "Stage <lights>, Sound hire",
      sections: [
        {
          items: [
            {
              actionLabel: "Review",
              amount: "₹12,400.00",
              meta: "Asha · Invoice uploaded",
              name: "Stage <lights>",
              status: { label: "Needs review", tone: "warning" },
              url: "https://dash.test/vp/1",
            },
          ],
          total: 1,
        },
      ],
    });

    expect(html).toContain(FOOTER_NOTE_PLACEHOLDER);
    expect(html).toContain("Stage &lt;lights&gt;");
    expect(html).not.toContain("Stage <lights>");
    expect(html).toContain("₹12,400.00");
    expect(html).toContain("Review vendor payments");
    expect(html).toContain("And 3 more.");
    expect(html).toContain('aria-hidden="true"');
  });
});
