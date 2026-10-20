import { afterAll, describe, expect, it, mock, setSystemTime } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module("@rocicorp/zero/react", () => ({
  useQuery: () => [[], { type: "complete" }],
  useZero: () => ({}),
}));
mock.module("@/components/shared/responsive-dialog", () => ({
  Dialog: pass,
  DialogContent: pass,
  DialogDescription: pass,
  DialogHeader: pass,
  DialogTitle: pass,
}));
// The form's default effective date, as a browser in this time zone sees it.
mock.module("@/components/form/form-layout", () => ({
  FormLayout: ({
    form,
  }: {
    form: { state: { values: { effectiveOn?: Date } } };
  }) => <output>{form.state.values.effectiveOn?.toDateString()}</output>,
}));
for (const [path, name] of [
  ["@/components/form/date-field", "DateField"],
  ["@/components/form/form-actions", "FormActions"],
  ["@/components/form/select-field", "SelectField"],
  ["@/components/form/textarea-field", "TextareaField"],
] as const) {
  mock.module(path, () => ({ [name]: () => null }));
}
const { PublishDialog } = await import("./policy-dialogs");

const zone = process.env.TZ;
afterAll(() => {
  process.env.TZ = zone;
  setSystemTime();
});

describe("PublishDialog", () => {
  it("defaults the effective date to India's day, not the browser's", () => {
    // 01:30 on 21 Oct in India, still 20 Oct for a browser on UTC.
    process.env.TZ = "UTC";
    setSystemTime(new Date("2026-10-20T20:00:00Z"));
    const html = renderToStaticMarkup(
      <PublishDialog documents={[]} onClose={() => undefined} policyId="p" />
    );
    expect(html).toContain("Wed Oct 21 2026");
  });
});
