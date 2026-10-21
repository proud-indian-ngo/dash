import { describe, expect, it } from "vitest";

import {
  parseStoredTemplateText,
  renderWhatsAppPreview,
  storedTemplateText,
} from "./preview";
import { TEMPLATE_FOOTER } from "./templates";

describe("renderWhatsAppPreview", () => {
  it("fills the parameters and adds the footer and dashboard button", () => {
    expect(
      renderWhatsAppPreview(
        { body: "Hi {{name}}, you joined {{team}}.", dashboardPath: "" },
        { name: "Priya", team: "Sunday" }
      )
    ).toEqual({
      body: [[{ bold: false, text: "Hi Priya, you joined Sunday." }]],
      button: "Open dashboard",
      filled: true,
      footer: TEMPLATE_FOOTER,
      header: null,
    });
  });

  it("keeps line breaks, bolds *text* and fills a header", () => {
    const preview = renderWhatsAppPreview(
      {
        body: "*Approved*: {{title}}\n\nOpen it for *details*",
        buttonText: "Join group",
        dashboardPath: "x",
        header: "Update on {{title}}",
      },
      { title: "Snacks" }
    );
    expect(preview.header).toBe("Update on Snacks");
    expect(preview.button).toBe("Join group");
    expect(preview.body).toEqual([
      [
        { bold: true, text: "Approved" },
        { bold: false, text: ": Snacks" },
      ],
      [{ bold: false, text: "" }],
      [
        { bold: false, text: "Open it for " },
        { bold: true, text: "details" },
      ],
    ]);
  });

  it("shows the placeholders when no parameters were recorded", () => {
    const preview = renderWhatsAppPreview({ body: "Hi {{name}}." }, null);
    expect(preview.filled).toBe(false);
    expect(preview.button).toBeNull();
    expect(preview.body).toEqual([[{ bold: false, text: "Hi {{name}}." }]]);
  });

  it("uses the donor footer and no text header for attached receipt PDFs", () => {
    const preview = renderWhatsAppPreview(
      {
        body: "Your donation receipt is attached.",
        footer: "Proud Indian · Thank you for your support",
        header: "Donation receipt",
        headerFormat: "DOCUMENT",
      },
      {}
    );
    expect(preview.footer).toBe("Proud Indian · Thank you for your support");
    expect(preview.header).toBeNull();
    expect(preview.button).toBeNull();
  });

  it("stores the header with the body and reads older body-only rows", () => {
    const template = {
      body: "Hi {{name}}.\n\n*Team:* {{team}} now",
      header: "Added",
    };
    expect(parseStoredTemplateText(storedTemplateText(template))).toEqual(
      template
    );
    expect(parseStoredTemplateText("Hi {{name}}.")).toEqual({
      body: "Hi {{name}}.",
    });
  });
});
