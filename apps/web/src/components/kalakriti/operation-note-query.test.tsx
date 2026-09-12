import { beforeEach, describe, expect, it, mock } from "bun:test";

import { queries } from "@pi-dash/zero/queries";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createOperationNoteLedger,
  makeOperationNoteAttempt,
} from "@/lib/kalakriti-operation-note";

const editionId = "00000000-0000-4000-8000-000000000001";
const ctx = {
  userId: "00000000-0000-4000-8000-000000000002",
  role: "super_admin",
  permissions: ["kalakriti.admin"],
};
let skippedHistory = false;
let resolvedKind: "student" | "guardian" | null = null;
const personId = "00000000-0000-4000-8000-000000000003";
const targetId = "00000000-0000-4000-8000-000000000004";
const historyArgs: unknown[] = [];
beforeEach(() => {
  skippedHistory = false;
  resolvedKind = null;
  historyArgs.length = 0;
});
mock.module("@/context/app-context", () => ({
  useApp: () => ({ hasPermission: () => true }),
}));
mock.module("@rocicorp/zero/react", () => ({
  useZero: () => ({}),
  useConnectionState: () => ({ name: "connected" }),
  useQuery: (request: any) => {
    if (!request) {
      skippedHistory = true;
      return [undefined, { type: "unknown" }];
    }
    // Zero contextualizes and validates requests even when enabled is false.
    request.query.fn({ args: request.args, ctx });
    if (request.query.queryName === "kalakritiEdition.byYear")
      return [{ id: editionId, lifecycle: "live" }, { type: "complete" }];
    if (request.query.queryName === "kalakritiOperation.studentByHumanId")
      return [
        resolvedKind === "student" ? { id: personId } : undefined,
        { type: "complete" },
      ];
    if (request.query.queryName === "kalakritiOperation.membershipByHumanId")
      return [
        resolvedKind === "guardian"
          ? { id: personId, kind: "guardian" }
          : undefined,
        { type: "complete" },
      ];
    if (request.query.queryName === "kalakritiOperation.bySubject") {
      historyArgs.push(request.args);
      return [
        [
          {
            id: targetId,
            type: "breakfast",
            supersededByOperationId: null,
            occurredAt: 1000,
            session: null,
          },
        ],
        { type: "complete" },
      ];
    }
    return [undefined, { type: "unknown" }];
  },
}));
const { OperationNotePanel } = await import("./operation-note-panel");
describe("initial correction lookup query contract", () => {
  it("renders the blank lookup without constructing an invalid subject-history query", () => {
    const html = renderToStaticMarkup(
      <OperationNotePanel
        editionId={editionId}
        year={2026}
        ledger={createOperationNoteLedger()}
        onBusyChange={() => undefined}
      />
    );
    expect(skippedHistory).toBe(true);
    expect(html).toContain("Yearly ID");
    expect(html).toContain("Look up");
    expect(html).toContain(
      "The scan remains effective; this does not undo it."
    );
  });
  for (const kind of ["student", "guardian"] as const) {
    it(`queries only the resolved ${kind} and returns to null on scope reset despite cached person data`, () => {
      resolvedKind = kind;
      const subject =
        kind === "student"
          ? { studentId: personId }
          : { membershipId: personId };
      const ledger = createOperationNoteLedger("original-scope");
      ledger.setAttempt(
        makeOperationNoteAttempt({
          editionId,
          targetOperationId: targetId,
          reason: "A note",
          humanId: kind === "student" ? "KAL-2026-0001" : "KALG-2026-0001",
          subject,
        })
      );
      const html = renderToStaticMarkup(
        <OperationNotePanel
          editionId={editionId}
          year={2026}
          ledger={ledger}
          onBusyChange={() => undefined}
        />
      );
      expect(historyArgs).toEqual([{ editionId, ...subject }]);
      expect(html).toContain("Operation");
      expect(html).toContain("Breakfast");
      expect(html).toContain("Retry correction note");
      historyArgs.length = 0;
      skippedHistory = false;
      const reset = renderToStaticMarkup(
        <OperationNotePanel
          editionId={editionId}
          year={2026}
          ledger={createOperationNoteLedger("changed-scope")}
          onBusyChange={() => undefined}
        />
      );
      expect(skippedHistory).toBe(true);
      expect(historyArgs).toEqual([]);
      expect(reset).toContain("Look up");
      expect(reset).not.toContain("Retry correction note");
    });
  }
  it("keeps the real history query's exactly-one-subject validation", () => {
    const request = queries.kalakritiOperation.bySubject({ editionId });
    expect(() => request.query.fn({ args: request.args, ctx })).toThrow(
      "Choose exactly one subject"
    );
  });
});
