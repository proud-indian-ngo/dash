import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createStationRecordingLedger } from "@/lib/kalakriti-scan-recording";
let queryIndex = 0;
let lifecycle = "live";
let queryType = "complete";
let online = true;
let decode: ((value: string) => void) | undefined;
let fail = false;
const requests: {
  args: { personQr?: string; humanId?: string; operationId: string };
}[] = [];
mock.module("@rocicorp/zero/react", () => ({
  useQuery: () =>
    queryIndex++ === 0
      ? [{ id: "edition", lifecycle }, { type: queryType }]
      : [[], { type: "complete" }],
  useConnectionState: () => ({ name: online ? "connected" : "disconnected" }),
  useZero: () => ({
    mutate: (request: (typeof requests)[number]) => {
      requests.push(request);
      return {
        server: fail
          ? Promise.reject(new Error("Offline"))
          : Promise.resolve({ type: "success" }),
      };
    },
  }),
}));
mock.module("@/components/form/form-layout", () => ({
  FormLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
mock.module("@/components/form/input-field", () => ({
  InputField: ({ label }: { label: string }) => <input aria-label={label} />,
}));
mock.module("@/components/form/form-actions", () => ({
  FormActions: ({
    disabled,
    submitLabel,
  }: {
    disabled: boolean;
    submitLabel: string;
  }) => (
    <button type="submit" disabled={disabled}>
      {submitLabel}
    </button>
  ),
}));
mock.module("./event-day-qr-scanner", () => ({
  EventDayQrScanner: ({ onScan }: { onScan: (value: string) => void }) => {
    decode = onScan;
    return <p>Camera fallback available</p>;
  },
}));
mock.module("@/lib/mutation-result", () => ({
  handleMutationResult: () => undefined,
}));
mock.module("evlog", () => ({ log: { error: () => undefined } }));
const { OperationScanPanel } = await import("./operation-scan-panel");
const studentId = "019f0000-0112-7000-8000-000000000001";
const studentQr = JSON.stringify({ id: studentId, type: "student" });
function render(activity: "meals" | "check_in" | "attendance" = "meals") {
  queryIndex = 0;
  return renderToStaticMarkup(
    <OperationScanPanel
      activity={activity}
      editionId="edition"
      year={2162}
      ledger={createStationRecordingLedger()}
      onBusyChange={() => undefined}
    />
  );
}
beforeEach(() => {
  lifecycle = "live";
  queryType = "complete";
  online = true;
  fail = false;
  decode = undefined;
  requests.length = 0;
});
describe("Non-transport scan capture", () => {
  it("keeps manual fallback visible and starts only for a complete live snapshot", () => {
    queryType = "unknown";
    const html = render();
    expect(decode).toBeUndefined();
    expect(html).toContain('aria-label="Yearly ID or Guardian record ID"');
    expect(html).toContain('disabled=""');
  });
  it.each(["check_in", "attendance"] as const)(
    "keeps the Yearly ID label for %s",
    (activity) => {
      const html = render(activity);
      expect(html).toContain('aria-label="Yearly ID"');
      expect(html).not.toContain(
        'aria-label="Yearly ID or Guardian record ID"'
      );
    }
  );
  it("does not start while offline or outside live", () => {
    lifecycle = "registration_locked";
    render();
    expect(decode).toBeUndefined();
    lifecycle = "live";
    online = false;
    render();
    expect(decode).toBeUndefined();
  });
  it("requires explicit Competition session selection", () => {
    const html = render("attendance");
    expect(html).toContain("Competition session");
    expect(decode).toBeUndefined();
  });
  it("canonicalizes person QR and suppresses both pending and successful duplicate frames", async () => {
    render();
    decode?.(studentQr);
    decode?.(studentQr);
    await Promise.resolve();
    decode?.(`{ "type": "student", "id": "${studentId}" }`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.args.personQr).toBe(studentQr);
  });
  it("retains original request arguments after an uncertain response", async () => {
    fail = true;
    render();
    decode?.(studentQr);
    await Promise.resolve();
    fail = false;
    decode?.(studentQr);
    await Promise.resolve();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.args).toEqual(requests[0]?.args);
  });
  it("rejects bearer payloads, Guardians and Students at volunteer check-in", () => {
    render("check_in");
    decode?.("secret-bearer-token");
    decode?.(studentQr);
    decode?.(JSON.stringify({ id: studentId, type: "guardian" }));
    expect(requests).toHaveLength(0);
  });
});
