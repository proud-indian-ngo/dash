import { describe, expect, it } from "bun:test";

import { blurField, isDismissBlur } from "./form-context";

describe("blurField", () => {
  const field = (isDirty: boolean) => {
    let blurred = 0;
    return {
      api: {
        handleBlur: () => {
          blurred++;
        },
        state: { meta: { isDirty } },
      },
      count: () => blurred,
    };
  };
  // A stand-in for a focused element; closest() matches the dismiss selector
  // when the button carries a close marker.
  const button = (attrs: Record<string, string>) =>
    ({
      closest: (selector: string) =>
        Object.entries(attrs).some(([name, value]) =>
          selector.includes(value ? `[${name}="${value}"]` : `[${name}]`)
        )
          ? {}
          : null,
    }) as unknown as EventTarget;

  it("treats closing controls and nowhere as dismissal", () => {
    expect(isDismissBlur(null)).toBe(true);
    expect(isDismissBlur(button({ "data-slot": "dialog-close" }))).toBe(true);
    expect(isDismissBlur(button({ "data-form-dismiss": "" }))).toBe(true);
    expect(isDismissBlur(button({ type: "submit" }))).toBe(false);
  });

  it("skips validation when an untouched field loses focus to a close", () => {
    const untouched = field(false);
    blurField(untouched.api, {
      relatedTarget: button({ "data-form-dismiss": "" }),
    });
    blurField(untouched.api, { relatedTarget: null });
    expect(untouched.count()).toBe(0);
  });

  it("validates on blur towards submit, and once the field is edited", () => {
    const untouched = field(false);
    blurField(untouched.api, { relatedTarget: button({ type: "submit" }) });
    expect(untouched.count()).toBe(1);

    const edited = field(true);
    blurField(edited.api, { relatedTarget: null });
    expect(edited.count()).toBe(1);
  });
});
