import { describe, expect, it } from "vitest";
import type { FormFieldApi } from "./form-context";
import { fieldErrorProps, getFieldErrorState } from "./form-context";

function makeField(
  errors: unknown[],
  name = "email",
  isBlurred = true
): FormFieldApi {
  return {
    name,
    state: {
      meta: {
        errors: errors as FormFieldApi["state"]["meta"]["errors"],
        isBlurred,
        isTouched: isBlurred,
      },
      value: "",
    },
    handleBlur: () => undefined,
    handleChange: () => undefined,
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
