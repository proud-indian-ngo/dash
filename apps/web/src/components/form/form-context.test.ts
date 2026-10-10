import { describe, expect, it } from "bun:test";

import type { FormFieldApi } from "./form-context";
import {
  blurField,
  fieldErrorProps,
  getFieldErrorState,
  isDismissBlur,
} from "./form-context";

function makeField(
  errors: unknown[],
  name = "email",
  isBlurred = true,
  isDirty = true
): FormFieldApi {
  return {
    handleBlur: () => undefined,
    handleChange: () => undefined,
    name,
    state: {
      meta: {
        errors: errors as FormFieldApi["state"]["meta"]["errors"],
        isBlurred,
        isDirty,
        isTouched: isBlurred,
      },
      value: "",
    },
  };
}

describe("getFieldErrorState", () => {
  it("returns hasError false when no errors", () => {
    const { hasError, errorMessageId } = getFieldErrorState(makeField([]));
    expect(hasError).toBe(false);
    expect(errorMessageId).toBe("email-error");
  });

  it("returns hasError true when errors exist and field was blurred", () => {
    const { hasError } = getFieldErrorState(
      makeField([{ message: "Required" }])
    );
    expect(hasError).toBe(true);
  });

  it("returns hasError false when errors exist but field was never blurred", () => {
    const { hasError } = getFieldErrorState(
      makeField([{ message: "Required" }], "email", false)
    );
    expect(hasError).toBe(false);
  });

  it("returns hasError true when submitted even if not blurred", () => {
    const { hasError } = getFieldErrorState(
      makeField([{ message: "Required" }], "email", false),
      true
    );
    expect(hasError).toBe(true);
  });

  it("uses field name for errorMessageId", () => {
    const { errorMessageId } = getFieldErrorState(
      makeField([{ message: "err" }], "phone")
    );
    expect(errorMessageId).toBe("phone-error");
  });
});

describe("fieldErrorProps", () => {
  it("returns aria-invalid false and no aria-describedby when no errors", () => {
    const result = fieldErrorProps(makeField([]));
    expect(result["aria-invalid"]).toBe(false);
    expect(result["aria-describedby"]).toBeUndefined();
  });

  it("returns aria-invalid true and aria-describedby when errors exist", () => {
    const result = fieldErrorProps(makeField([{ message: "Required" }]));
    expect(result["aria-invalid"]).toBe(true);
    expect(result["aria-describedby"]).toBe("email-error");
  });

  it("uses field name for error message id", () => {
    const result = fieldErrorProps(makeField([{ message: "err" }], "phone"));
    expect(result["aria-describedby"]).toBe("phone-error");
  });
});

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
