import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { FormInstance, FormStateSlice } from "./form-context";
import { useFormSubmitted } from "./form-context";
import { FormLayout, getSubmitErrorMessage } from "./form-layout";

function formWith(live: Partial<FormStateSlice>): FormInstance {
  const snapshot: FormStateSlice = {
    isSubmitting: false,
    submissionAttempts: 0,
    values: {},
  };
  const current = { ...snapshot, ...live };
  return {
    Field: () => null,
    Subscribe: () => null,
    getFieldValue: () => undefined,
    handleSubmit: () => undefined,
    // A stale snapshot: what the form looked like before the submit.
    state: snapshot,
    store: {
      get: () => current,
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
  };
}

describe("FormLayout", () => {
  it("shows the submit error from the live form store", () => {
    const html = renderToStaticMarkup(
      <FormLayout
        form={formWith({ errorMap: { onSubmit: "Registration closed" } })}
        showSubmitError
      >
        <span />
      </FormLayout>
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Registration closed");
  });

  it("shows nothing while the form has no submit error", () => {
    const html = renderToStaticMarkup(
      <FormLayout form={formWith({})} showSubmitError>
        <span />
      </FormLayout>
    );
    expect(html).not.toContain('role="alert"');
  });
});

function Probe({ form }: { form: FormInstance }) {
  const submitted = useFormSubmitted(form);
  return <span>{`submitted: ${submitted}`}</span>;
}

describe("useFormSubmitted", () => {
  it("reads the live store, not the render-time snapshot", () => {
    const html = renderToStaticMarkup(
      <Probe form={formWith({ submissionAttempts: 1 })} />
    );
    expect(html).toContain("submitted: true");
  });
});

describe("getSubmitErrorMessage", () => {
  it("reads strings, form errors and messages", () => {
    expect(getSubmitErrorMessage(undefined)).toBeUndefined();
    expect(getSubmitErrorMessage("Closed")).toBe("Closed");
    expect(getSubmitErrorMessage({ form: "Form closed" })).toBe("Form closed");
    expect(getSubmitErrorMessage({ message: "Failed" })).toBe("Failed");
  });

  it("leaves field issues to the fields", () => {
    expect(
      getSubmitErrorMessage({ name: [{ message: "Name is required" }] })
    ).toBeUndefined();
  });

  it("shows issues on the form itself", () => {
    expect(
      getSubmitErrorMessage({
        "": [{ message: "Pick at least one Student" }],
        name: [{ message: "Name is required" }],
      })
    ).toBe("Pick at least one Student");
  });

  it("falls back for errors it cannot read", () => {
    expect(getSubmitErrorMessage({ code: 500 })).toBe(
      "Something went wrong while submitting the form."
    );
  });
});
