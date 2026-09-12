import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createOperationNoteLedger,
  makeOperationNoteAttempt,
} from "@/lib/kalakriti-operation-note";

let index = 0;
let role = "food_lead";
let complete = true;
let online = true;
let uncertain = false;
let superseded: string | null = null;
let form: any;
let actions: any;
const requests: any[] = [];
const logs: any[] = [];
const results: any[] = [];
mock.module("@/context/app-context", () => ({
  useApp: () => ({ hasPermission: () => false }),
}));
mock.module("@pi-dash/zero/queries", () => ({
  queries: {
    kalakritiEdition: { byYear: () => null },
    kalakritiAssignment: { myAccess: () => null },
    kalakritiOperation: {
      studentByHumanId: () => null,
      membershipByHumanId: () => null,
      bySubject: () => null,
    },
  },
}));
mock.module("@pi-dash/zero/mutators", () => ({
  mutators: { kalakritiOperation: { correct: (args: any) => args } },
}));
mock.module("@rocicorp/zero/react", () => ({
  useConnectionState: () => ({ name: online ? "connected" : "disconnected" }),
  useQuery: () => {
    const values = [
      { id: "edition", lifecycle: "live", timezone: "Asia/Kolkata" },
      { kind: "volunteer", assignments: [{ responsibility: role }] },
      { id: "student" },
      null,
      [
        {
          id: "original",
          type: "breakfast",
          supersededByOperationId: superseded,
          occurredAt: 1000,
          session: null,
        },
      ],
    ];
    return [values[index++], { type: complete ? "complete" : "unknown" }];
  },
  useZero: () => ({
    mutate: (args: any) => {
      requests.push(args);
      return {
        server: uncertain
          ? Promise.reject(new Error("private payload"))
          : Promise.resolve({ type: "success" }),
      };
    },
  }),
}));
mock.module("@tanstack/react-form", () => ({
  useForm: (config: any) => {
    form = config;
    return {};
  },
}));
mock.module("@/components/form/form-layout", () => ({
  FormLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
mock.module("@/components/form/form-actions", () => ({
  FormActions: (props: any) => {
    actions = props;
    return null;
  },
}));
mock.module("@/components/form/input-field", () => ({
  InputField: () => null,
}));
mock.module("@/components/form/select-field", () => ({
  SelectField: () => null,
}));
mock.module("@/components/form/textarea-field", () => ({
  TextareaField: () => null,
}));
mock.module("@/lib/mutation-result", () => ({
  handleMutationResult: (result: any) => results.push(result),
}));
mock.module("evlog", () => ({
  log: { error: (entry: any) => logs.push(entry) },
}));
const { OperationNotePanel } = await import("./operation-note-panel");
function pendingLedger() {
  const ledger = createOperationNoteLedger("edition:food-lead");
  ledger.setAttempt(
    makeOperationNoteAttempt({
      editionId: "edition",
      targetOperationId: "original",
      reason: "Private explanation",
      humanId: "KAL-2026-0001",
      subject: { studentId: "student" },
    })
  );
  return ledger;
}
function render(ledger = pendingLedger()) {
  index = 0;
  return renderToStaticMarkup(
    <OperationNotePanel
      editionId="edition"
      year={2026}
      ledger={ledger}
      onBusyChange={() => undefined}
    />
  );
}
beforeEach(() => {
  role = "food_lead";
  complete = true;
  online = true;
  uncertain = false;
  superseded = null;
  requests.length = 0;
  logs.length = 0;
  results.length = 0;
});

describe("correction note submission", () => {
  it("explains annotation and validates a reason and explicit target", () => {
    expect(render()).toContain(
      "The scan remains effective; this does not undo it."
    );
    expect(
      form.validators.onSubmit.safeParse({
        targetOperationId: "",
        reason: "note",
      }).success
    ).toBe(false);
    expect(
      form.validators.onSubmit.safeParse({
        targetOperationId: "original",
        reason: "   ",
      }).success
    ).toBe(false);
    expect(
      form.validators.onSubmit.safeParse({
        targetOperationId: "original",
        reason: "x".repeat(501),
      }).success
    ).toBe(false);
  });
  it("retries exact captured arguments after uncertainty, even after its own revision appears", async () => {
    const ledger = pendingLedger();
    const args = ledger.attempt!.args;
    uncertain = true;
    render(ledger);
    await form.onSubmit({
      value: {
        targetOperationId: "original",
        reason: "Changed text must not retarget retry",
      },
    });
    expect(ledger.attempt?.args).toBe(args);
    expect(requests[0]).toBe(args);
    expect(JSON.stringify(logs)).not.toContain("Private explanation");
    expect(JSON.stringify(logs)).not.toContain("KAL-2026");
    expect(JSON.stringify(logs)).not.toContain("private payload");
    superseded = args.id;
    uncertain = false;
    render(ledger);
    await form.onSubmit({
      value: { targetOperationId: "original", reason: args.reason },
    });
    expect(requests[1]).toBe(args);
    expect(ledger.attempt).toBeNull();
    expect(results).toHaveLength(1);
  });
  it("blocks incomplete snapshots, offline state, downgraded roles and unrelated replacement targets", async () => {
    for (const change of [
      () => {
        complete = false;
      },
      () => {
        online = false;
      },
      () => {
        role = "food_member";
      },
      () => {
        superseded = "another-revision";
      },
    ]) {
      complete = true;
      online = true;
      role = "food_lead";
      superseded = null;
      change();
      render();
      if (superseded === null) expect(actions.disabled).toBe(true);
      await form.onSubmit({
        value: { targetOperationId: "original", reason: "note" },
      });
      expect(requests).toHaveLength(0);
    }
  });
});
