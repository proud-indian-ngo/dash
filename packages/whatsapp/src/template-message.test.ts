import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/env/server", () => ({ env: {} }));

import { toTemplateSendBody } from "./cloud";
import {
  BODY_MAX_LENGTH,
  fitToBody,
  flattenParameter,
  whatsappTemplate,
} from "./template-message";
import { WHATSAPP_TEMPLATES } from "./templates";

describe("flattenParameter", () => {
  it("puts typed text on one line", () => {
    expect(flattenParameter("  Paid\n\nto your\taccount   on file ")).toBe(
      "Paid to your account on file"
    );
  });

  it("never sends an empty value", () => {
    expect(flattenParameter(" \n ")).toBe("-");
  });

  it("cuts long values to fit Meta's limit", () => {
    const value = flattenParameter("a".repeat(400));
    expect(value).toHaveLength(300);
    expect(value.endsWith("…")).toBe(true);
  });
});

describe("whatsappTemplate", () => {
  it("flattens values and drops the path's leading slash", () => {
    expect(
      whatsappTemplate(
        "request_not_approved",
        {
          amount: "₹1,250",
          reason: "Bill\nunreadable",
          request_type: "reimbursement",
          title: "Snacks",
        },
        "/reimbursements/r1"
      )
    ).toEqual({
      name: "request_not_approved",
      params: {
        amount: "₹1,250",
        reason: "Bill unreadable",
        request_type: "reimbursement",
        title: "Snacks",
      },
      path: "reimbursements/r1",
    });
  });

  it("has no path for templates without a dashboard button", () => {
    expect(whatsappTemplate("account_deactivated", {})).toEqual({
      name: "account_deactivated",
      params: {},
    });
  });

  it("requires and preserves a document for a document template", () => {
    const document = {
      bytes: new Uint8Array([37, 80, 68, 70]),
      filename: "donation-receipt.pdf",
    };
    expect(
      whatsappTemplate(
        "donation_receipt",
        {
          amount: "₹5,000",
          number: "PI-2026-0012",
          received_on: "21 October 2026",
        },
        document
      )
    ).toMatchObject({ document, name: "donation_receipt" });
  });
});

describe("toTemplateSendBody", () => {
  it("names each body parameter and fills the button's path", () => {
    const body = toTemplateSendBody(
      whatsappTemplate(
        "event_added",
        { details: "on Sat, 18 Oct", event: "Science Fair" },
        "/events/e 1"
      )
    );
    expect(body).toEqual({
      components: [
        {
          parameters: [
            { parameter_name: "details", text: "on Sat, 18 Oct", type: "text" },
            { parameter_name: "event", text: "Science Fair", type: "text" },
          ],
          type: "body",
        },
        {
          index: "0",
          parameters: [{ text: "events/e%201", type: "text" }],
          sub_type: "url",
          type: "button",
        },
      ],
      language: { code: "en" },
      name: "event_added",
    });
  });

  it("keeps an already-encoded path as it is", () => {
    const body = toTemplateSendBody(
      whatsappTemplate(
        "kalakriti_transport_changed",
        { edition: "Kalakriti 2026" },
        "/kalakriti/2026/centers?centerId=a%2Fb"
      )
    );
    expect(body.components.at(-1)).toMatchObject({
      parameters: [{ text: "kalakriti/2026/centers?centerId=a%2Fb" }],
    });
  });

  it("sends no components for a template without parameters or button", () => {
    expect(
      toTemplateSendBody(whatsappTemplate("account_password_reset", {}))
        .components
    ).toEqual([]);
  });

  it("sends an uploaded document as the template header", () => {
    const message = whatsappTemplate(
      "donation_receipt",
      {
        amount: "₹5,000",
        number: "PI-2026-0012",
        received_on: "21 October 2026",
      },
      { bytes: new Uint8Array([1]), filename: "receipt.pdf" }
    );
    expect(toTemplateSendBody(message, "media-1").components[0]).toEqual({
      parameters: [
        {
          document: { filename: "receipt.pdf", id: "media-1" },
          type: "document",
        },
      ],
      type: "header",
    });
  });
});

describe("fitToBody", () => {
  const filled = (body: string, params: Record<string, string>) =>
    body.replace(/\{\{([a-z_]+)\}\}/g, (_, name: string) => params[name] ?? "");

  it.each(WHATSAPP_TEMPLATES)(
    "$name stays within Meta's limit with every value at its longest",
    (template) => {
      const longest = Object.fromEntries(
        Object.keys(template.examples).map((key) => [key, "x".repeat(400)])
      );
      const build = whatsappTemplate as unknown as (
        name: string,
        params: Record<string, string>,
        path?: string
      ) => { params: Record<string, string> };
      const path = "dashboardPath" in template ? "/p" : undefined;
      const message = build(template.name, longest, path);
      expect(filled(template.body, message.params).length).toBeLessThanOrEqual(
        BODY_MAX_LENGTH
      );
    }
  );

  it("shortens the longest value first and leaves short ones alone", () => {
    const body = "Title {{title}} note {{note}} by {{who}}.";
    const fitted = fitToBody(body, {
      note: "n".repeat(1100),
      title: "t".repeat(100),
      who: "Priya",
    });
    expect(fitted.who).toBe("Priya");
    expect(fitted.title).toBe("t".repeat(100));
    expect(filled(body, fitted).length).toBeLessThanOrEqual(BODY_MAX_LENGTH);
    expect(fitted.note?.endsWith("…")).toBe(true);
  });
});
