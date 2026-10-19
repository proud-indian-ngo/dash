import { describe, expect, it } from "vitest";

import {
  DASHBOARD_BUTTON_TEXT,
  TEMPLATE_FOOTER,
  templateParameters,
  toTemplatePayload,
  WHATSAPP_TEMPLATES,
} from "./templates";

const APP_URL = "https://dash.example.org/";

function find(name: string) {
  const template = WHATSAPP_TEMPLATES.find((t) => t.name === name);
  if (!template) {
    throw new Error(`No template ${name}`);
  }
  return template;
}

describe("WhatsApp templates", () => {
  it("have unique names Meta accepts", () => {
    const names = WHATSAPP_TEMPLATES.map((template) => template.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9_]{1,512}$/);
    }
  });

  it.each(WHATSAPP_TEMPLATES)("$name follows Meta's body rules", (template) => {
    expect(template.body.length).toBeLessThanOrEqual(1024);
    // Meta treats `{{x}}.` as trailing; a closing quote (`"{{x}}".`) passes.
    expect(template.body).not.toMatch(/^[\s.,!?]*\{\{/);
    expect(template.body).not.toMatch(/\}\}[\s.,!?]*$/);
    expect(template.body).not.toMatch(/\t/);
  });

  it.each(WHATSAPP_TEMPLATES)(
    "$name is laid out in house style",
    (template) => {
      // One blank line at most; preview.ts stores the header after three.
      expect(template.body).not.toMatch(/\n\n\n/);
      for (const line of template.body.split("\n")) {
        expect(line).not.toMatch(/^\W*\{\{[a-z_]+\}\}\W*$/);
        expect(line.split("*").length % 2).toBe(1);
      }
    }
  );

  it.each(WHATSAPP_TEMPLATES)("$name has a plain text header", (template) => {
    expect(template.header.length).toBeLessThanOrEqual(60);
    expect(template.header).not.toMatch(
      /\{\{|[*_~`\n]|\p{Extended_Pictographic}/u
    );
  });

  it.each(WHATSAPP_TEMPLATES)(
    "$name has enough words per parameter",
    (template) => {
      const parameters = templateParameters(template.body).length;
      const words = template.body
        .replace(/\{\{[a-z_]+\}\}/g, " ")
        .split(/\s+/)
        .filter((word) => /[a-z]/i.test(word)).length;
      // Meta's "parameters words ratio" limit: 2 words per parameter
      // failed, 2.5 passed.
      expect(words).toBeGreaterThanOrEqual(parameters * 2.5);
    }
  );

  it.each(WHATSAPP_TEMPLATES)(
    "$name has one example per parameter",
    (template) => {
      const parameters = templateParameters(template.body);
      expect(new Set(parameters).size).toBe(parameters.length);
      expect(Object.keys(template.examples).sort()).toEqual(
        [...parameters].sort()
      );
      for (const value of Object.values(template.examples)) {
        expect(value).not.toMatch(/[\n\t]/);
        expect(value.trim()).not.toBe("");
      }
    }
  );

  it("fits the footer and button text limits", () => {
    expect(TEMPLATE_FOOTER.length).toBeLessThanOrEqual(60);
    expect(DASHBOARD_BUTTON_TEXT.length).toBeLessThanOrEqual(25);
    for (const template of WHATSAPP_TEMPLATES) {
      if ("buttonText" in template) {
        expect(template.buttonText.length).toBeLessThanOrEqual(25);
      }
    }
  });
});

describe("toTemplatePayload", () => {
  it("names each parameter with its example", () => {
    const payload = toTemplatePayload(find("event_added"), APP_URL);
    expect(payload).toMatchObject({
      category: "UTILITY",
      language: "en",
      name: "event_added",
      parameter_format: "named",
    });
    expect(payload.components[1]).toEqual({
      example: {
        body_text_named_params: [
          { example: "Science Fair", param_name: "event" },
          {
            example: "on Sat, 18 Oct, 10:00 AM at Cubbon Park",
            param_name: "details",
          },
        ],
      },
      text: find("event_added").body,
      type: "BODY",
    });
  });

  it("links the dashboard button to a path the sender fills in", () => {
    const payload = toTemplatePayload(find("event_added"), APP_URL);
    expect(payload.components).toContainEqual({
      buttons: [
        {
          example: ["https://dash.example.org/events/0192"],
          text: "Open dashboard",
          type: "URL",
          url: "https://dash.example.org/{{1}}",
        },
      ],
      type: "BUTTONS",
    });
  });

  it("uses a fixed home link when the template has no path", () => {
    const payload = toTemplatePayload(find("account_welcome"), APP_URL);
    expect(payload.components).toContainEqual({
      buttons: [
        {
          text: "Open dashboard",
          type: "URL",
          url: "https://dash.example.org/",
        },
      ],
      type: "BUTTONS",
    });
  });

  it("leaves out the example and buttons when there are none", () => {
    const payload = toTemplatePayload(find("account_deactivated"), APP_URL);
    expect(payload.components).toEqual([
      { format: "TEXT", text: "Account deactivated", type: "HEADER" },
      { text: find("account_deactivated").body, type: "BODY" },
      { text: "Proud Indian · Change alerts in Settings", type: "FOOTER" },
    ]);
  });

  it("labels the group invite button and links it through the dashboard", () => {
    const payload = toTemplatePayload(find("group_invite"), APP_URL);
    expect(payload.components).toContainEqual({
      buttons: [
        {
          example: ["https://dash.example.org/whatsapp-groups/0192/join"],
          text: "Join group",
          type: "URL",
          url: "https://dash.example.org/{{1}}",
        },
      ],
      type: "BUTTONS",
    });
  });
});
