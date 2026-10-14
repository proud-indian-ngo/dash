import { describe, expect, it } from "vitest";

import {
  buildDigest,
  buildWhatsAppDigestText,
  buildWhatsAppText,
  type DigestEntry,
} from "./digest";
import { TOPICS } from "./topics";

const needsReview = { label: "Needs review", tone: "warning" } as const;
const vendorPayments = {
  label: "Review vendor payments",
  path: "/vendor-payments",
};

const noInvoice = (id: string, amountPaise: number): DigestEntry => ({
  body: `Asha says "${id}" has no invoice — time to review.`,
  clickAction: `/vendor-payments/${id}`,
  digest: {
    actionLabel: "Review",
    amountPaise,
    list: vendorPayments,
    meta: "Asha · Rent / lease · No proof",
    name: id,
    status: needsReview,
  },
  title: "📄 Payment without invoice",
});

const invoice = (id: string): DigestEntry => ({
  body: `Ravi uploaded an invoice for "${id}" — time to review.`,
  clickAction: `/vendor-payments/${id}`,
  digest: {
    actionLabel: "Review",
    list: vendorPayments,
    meta: "Ravi · Invoice uploaded",
    name: id,
    status: needsReview,
  },
  title: "📄 New invoice",
});

const appUrl = "https://dash.test";

describe("buildDigest", () => {
  it("carries a shared title in the heading and lists rows without a subheading", () => {
    const digest = buildDigest(
      [noInvoice("Stage lights", 1_240_000), noInvoice("Sound hire", 800_000)],
      TOPICS.REQUESTS_SUBMISSIONS,
      { appUrl, limit: 20 }
    );

    expect(digest.heading).toBe("Payment without invoice (2)");
    expect(digest.intro).toBe("From Requests · Pending approvals.");
    expect(digest.preview).toBe("Stage lights, Sound hire");
    expect(digest.sections).toHaveLength(1);
    expect(digest.sections[0]?.title).toBeUndefined();
    expect(digest.sections[0]?.items[0]).toEqual({
      actionLabel: "Review",
      amount: "₹12,400.00",
      meta: "Asha · Rent / lease · No proof",
      name: "Stage lights",
      status: undefined,
      url: "https://dash.test/vendor-payments/Stage lights",
    });
    expect(digest.cta).toEqual({
      label: "Review vendor payments",
      url: "https://dash.test/vendor-payments",
    });
  });

  it("groups mixed titles into sections in arrival order", () => {
    const digest = buildDigest(
      [
        noInvoice("Stage lights", 100),
        invoice("Venue"),
        noInvoice("Sound hire", 100),
      ],
      TOPICS.REQUESTS_SUBMISSIONS,
      { appUrl, limit: 20 }
    );

    expect(digest.heading).toBe("3 new notifications");
    expect(
      digest.sections.map((s) => [s.title, s.items.map((i) => i.name)])
    ).toEqual([
      ["Payment without invoice", ["Stage lights", "Sound hire"]],
      ["New invoice", ["Venue"]],
    ]);
  });

  it("keeps statuses only when they tell rows apart", () => {
    const approved = { label: "Approved", tone: "success" } as const;
    const digest = buildDigest(
      [
        invoice("Venue"),
        { ...invoice("Bus"), digest: { name: "Bus", status: approved } },
      ],
      TOPICS.REQUESTS_SUBMISSIONS,
      { limit: 20 }
    );

    expect(digest.sections[0]?.items.map((i) => i.status)).toEqual([
      needsReview,
      approved,
    ]);
  });

  it("lists rows flat when no title repeats, without exclamations", () => {
    const digest = buildDigest(
      [
        { ...invoice("Venue"), title: "✅ Invoice approved!" },
        { ...invoice("Bus"), title: "✅ Payment completed!" },
      ],
      TOPICS.REQUESTS_STATUS,
      { limit: 20 }
    );

    expect(digest.heading).toBe("2 new notifications");
    expect(digest.sections).toHaveLength(1);
    expect(digest.sections[0]?.title).toBeUndefined();

    const single = buildDigest(
      [
        { ...invoice("Venue"), title: "✅ Invoice approved!" },
        { ...invoice("Bus"), title: "✅ Invoice approved!" },
      ],
      TOPICS.REQUESTS_STATUS,
      { limit: 20 }
    );
    expect(single.heading).toBe("Invoice approved (2)");
  });

  it("collapses repeat updates to one record into its latest row", () => {
    const update = (meta: string): DigestEntry => ({
      body: "",
      clickAction: "/teams/t1",
      digest: { meta, name: "Beach clean-up", status: needsReview },
      title: "📅 Event update",
    });
    const digest = buildDigest(
      [update("Sat 10 am"), invoice("Venue"), update("Sat 11 am")],
      TOPICS.EVENTS_SCHEDULE,
      { limit: 20 }
    );

    const names = digest.sections.flatMap((s) => s.items.map((i) => i.name));
    expect(names).toEqual(["Venue", "Beach clean-up"]);
    expect(digest.sections[0]?.items[1]?.meta).toBe("Sat 11 am · 2 updates");
  });

  it("keeps two payments on one record apart", () => {
    const payment = (amountPaise: number): DigestEntry => ({
      body: "",
      clickAction: "/vendor-payments/vp-1",
      digest: { amountPaise, name: "Venue" },
      title: "💰 New payment logged",
    });
    const digest = buildDigest(
      [payment(100), payment(200)],
      TOPICS.REQUESTS_SUBMISSIONS,
      { limit: 20 }
    );

    expect(digest.heading).toBe("New payment logged (2)");
    expect(digest.subject).toBe("New payment logged (2) · Pending approvals");
  });

  it("drops a closing question mark from headings", () => {
    const nudge = (name: string): DigestEntry => ({
      body: "",
      clickAction: `/events/${name}`,
      digest: { name },
      title: "📸 Got pics?",
    });
    expect(
      buildDigest([nudge("a"), nudge("b")], TOPICS.EVENTS_PHOTOS, { limit: 20 })
        .heading
    ).toBe("Got pics (2)");
  });

  it("falls back to the dashboard when rows point to different lists", () => {
    const digest = buildDigest(
      [
        invoice("Venue"),
        {
          ...invoice("Bus"),
          digest: {
            list: { label: "Review reimbursements", path: "/reimbursements" },
            name: "Bus",
          },
        },
      ],
      TOPICS.REQUESTS_SUBMISSIONS,
      { appUrl, limit: 20 }
    );

    expect(digest.cta).toEqual({ label: "Open dashboard", url: appUrl });
  });

  it("uses the title and body for a notification without a row", () => {
    const digest = buildDigest(
      [
        { body: "a", clickAction: null, title: "👥 Added to team" },
        { body: "b", clickAction: null, title: "✏️ Team updated" },
      ],
      TOPICS.TEAMS,
      { limit: 20 }
    );

    expect(digest.intro).toBe("From Teams.");
    expect(digest.sections[0]?.items[0]).toEqual({
      actionLabel: "View",
      meta: "a",
      name: "Added to team",
      url: undefined,
    });
  });

  it("stops at the limit across sections and counts the rest", () => {
    const digest = buildDigest(
      [
        noInvoice("a", 1),
        noInvoice("b", 1),
        invoice("c"),
        invoice("d"),
        invoice("e"),
      ],
      TOPICS.REQUESTS_SUBMISSIONS,
      { limit: 3 }
    );

    expect(digest.sections.map((s) => s.items.length)).toEqual([2, 1]);
    expect(digest.preview).toBe("a, b, c and 2 more");
    expect(digest.sections[1]?.total).toBe(3);
    expect(digest.moreCount).toBe(2);
  });
});

describe("buildWhatsAppText", () => {
  it("adds the link, payment proof and footer", () => {
    expect(
      buildWhatsAppText({
        appName: "PI",
        appUrl,
        body: "Paid",
        clickAction: "/vendor-payments/vp-1",
        imageUrl: "https://img.test/proof.png",
        title: "✅ Payment approved!",
      })
    ).toBe(
      "*✅ Payment approved!*\n\nPaid\n\nView: https://dash.test/vendor-payments/vp-1\n\nPayment proof: https://img.test/proof.png\n\n_Sent by PI_(https://dash.test)"
    );
  });
});

describe("buildWhatsAppDigestText", () => {
  it("numbers rows with amount and link", () => {
    const text = buildWhatsAppDigestText(
      [noInvoice("Stage lights", 1_240_000), invoice("Venue")],
      TOPICS.REQUESTS_SUBMISSIONS,
      { appName: "PI", appUrl }
    );

    expect(text).toBe(
      [
        "*2 new notifications*",
        "",
        "From Requests · Pending approvals.",
        "",
        "1. *Stage lights* · ₹12,400.00",
        "Asha · Rent / lease · No proof",
        "View: https://dash.test/vendor-payments/Stage lights",
        "",
        "2. *Venue*",
        "Ravi · Invoice uploaded",
        "View: https://dash.test/vendor-payments/Venue",
        "",
        "_Sent by PI_(https://dash.test)",
      ].join("\n")
    );
  });

  it("shortens long fallback bodies", () => {
    const text = buildWhatsAppDigestText(
      [
        { body: "x".repeat(500), clickAction: null, title: "A" },
        { body: "y", clickAction: null, title: "A" },
      ],
      TOPICS.TEAMS,
      { appName: "PI", appUrl: undefined }
    );

    expect(text).toContain(`${"x".repeat(199)}…`);
    expect(text).not.toContain("x".repeat(200));
  });
});
