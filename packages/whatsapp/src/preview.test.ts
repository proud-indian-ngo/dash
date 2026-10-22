import { describe, expect, it } from "vitest";

import { parseStoredTemplateText, storedTemplateText } from "./preview";

describe("stored template text", () => {
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
