import { describe, expect, it, mock } from "bun:test";

import {
  kalakritiOperationMutators,
  kalakritiOperationRecordSchema,
} from "../kalakriti-operation";

const adminContext = {
  permissions: ["kalakriti.admin"],
  role: "admin",
  userId: "admin-1",
};
const student = {
  id: "01950000-0000-7000-8000-000000000001",
  editionId: "edition-1",
  centerId: "center-1",
  humanId: "KAL-2027-0001",
};
const volunteer = {
  id: "01950000-0000-7000-8000-000000000002",
  editionId: "edition-1",
  humanId: "KALV-2027-0001",
  kind: "volunteer",
  state: "active",
};
const personQr = JSON.stringify({ id: student.id, type: "student" });
const baseArgs = {
  auditEntryId: "audit-1",
  editionId: "edition-1",
  id: "operation-row-1",
  now: 1000,
  occurredAt: 900,
  operationId: "operation-1",
  type: "pickup" as const,
};
const existing = {
  ...baseArgs,
  competitionSessionId: null,
  membershipId: null,
  studentId: student.id,
  recordedBy: "admin-1",
  supersededByOperationId: null,
};

function setup(results: unknown[] = [], lifecycle = "live") {
  const edition = {
    id: "edition-1",
    lifecycle,
    eventDate: "2027-11-21",
    year: 2027,
  };
  let selectingCenter = false;
  const lock = mock(async () => [
    selectingCenter
      ? { id: student.centerId, editionId: student.editionId, retiredAt: null }
      : edition,
  ]);
  const query = { from: () => query, where: () => query, for: lock };
  const insertOperation = mock();
  const insertAudit = mock();
  const tx = {
    location: "server",
    dbTransaction: {
      wrappedTransaction: {
        select: (fields: object) => {
          selectingCenter = "retiredAt" in fields;
          return query;
        },
      },
    },
    mutate: {
      kalakritiCenterScanStage: { insert: mock() },
      kalakritiOperation: { insert: insertOperation },
      kalakritiAuditEntry: { insert: insertAudit },
    },
    run: mock(
      async (query: { ast: { table: string; related?: unknown[] } }) => {
        if (query.ast.table === "kalakritiCenterScanStage") return [];
        if (query.ast.table === "kalakritiStudent" && query.ast.related?.length)
          return [{ ...student, name: "Student", operations: [] }];
        return results.shift();
      }
    ),
  };
  return { tx, insertOperation, insertAudit, lock };
}

async function record(
  tx: unknown,
  args: object = {},
  ctx: object = adminContext
) {
  await kalakritiOperationMutators.record.fn({
    tx,
    ctx,
    args: { ...baseArgs, personQr, ...args },
  } as never);
}
async function manual(
  tx: unknown,
  args: object = {},
  ctx: object = adminContext
) {
  await kalakritiOperationMutators.recordManual.fn({
    tx,
    ctx,
    args: { ...baseArgs, humanId: student.humanId, ...args },
  } as never);
}

describe("person QR operation recording", () => {
  it("accepts the current sheet JSON payload in the record schema", () => {
    expect(
      kalakritiOperationRecordSchema.safeParse({ ...baseArgs, personQr })
        .success
    ).toBe(true);
  });

  it.each(["center-1", "other-center"])(
    "applies the same Center scope to manual recording at %s",
    async (centerId) => {
      const { tx, insertOperation } = setup([
        undefined,
        student,
        { id: "operator", kind: "volunteer" },
        [{ responsibility: "liaison", centerId, competitionId: null }],
        [],
      ]);
      const action = manual(
        tx,
        {},
        { userId: "operator", permissions: ["kalakriti.view"] }
      );
      if (centerId === student.centerId) {
        await action;
        expect(insertOperation).toHaveBeenCalledTimes(1);
      } else {
        await expect(action).rejects.toThrow("Unauthorized");
        expect(insertOperation).not.toHaveBeenCalled();
      }
    }
  );
  it.each(["qr", "manual"])(
    "records a Student pickup with %s and privacy-safe audit",
    async (mode) => {
      const { tx, insertOperation, insertAudit, lock } = setup([
        undefined,
        student,
        [],
      ]);
      await (mode === "qr" ? record(tx) : manual(tx));
      expect(lock).toHaveBeenCalledWith("update");
      expect(insertOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: student.id,
          membershipId: null,
          type: "pickup",
        })
      );
      expect(insertAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            operationId: "operation-1",
            subjectKind: "student",
            type: "pickup",
          },
        })
      );
      expect(JSON.stringify(insertAudit.mock.calls)).not.toContain(student.id);
    }
  );

  it.each(["qr", "manual"])(
    "records active volunteer check-in with %s",
    async (mode) => {
      const { tx, insertOperation } = setup(
        mode === "qr"
          ? [undefined, volunteer, []]
          : [undefined, undefined, volunteer, []]
      );
      const args = {
        type: "volunteer_check_in",
        personQr: JSON.stringify({ id: volunteer.id, type: "volunteer" }),
        humanId: volunteer.humanId,
      };
      await (mode === "qr" ? record(tx, args) : manual(tx, args));
      expect(insertOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          membershipId: volunteer.id,
          studentId: null,
          type: "volunteer_check_in",
        })
      );
    }
  );

  it.each([
    "not JSON",
    "null",
    "[]",
    "{}",
    JSON.stringify({ id: "KAL-2027-0001", type: "student" }),
    JSON.stringify({ id: student.id, type: "admin" }),
    JSON.stringify({ id: student.id, type: "student", extra: true }),
    " ".repeat(257),
  ])("rejects malformed payload %s at schema and runtime", async (payload) => {
    expect(
      kalakritiOperationRecordSchema.safeParse({
        ...baseArgs,
        personQr: payload,
      }).success
    ).toBe(false);
    const { tx, insertOperation } = setup([undefined]);
    await expect(record(tx, { personQr: payload })).rejects.toThrow(
      "Invalid person QR"
    );
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it("rejects Guardian QR before subject lookup", async () => {
    const { tx, insertOperation } = setup([undefined]);
    await expect(
      record(tx, {
        personQr: JSON.stringify({ id: volunteer.id, type: "guardian" }),
      })
    ).rejects.toThrow("Guardians cannot be operation subjects");
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it.each([undefined, { ...student, editionId: "other" }])(
    "rejects absent or cross-Edition Students",
    async (subject) => {
      const { tx, insertOperation } = setup([undefined, subject]);
      await expect(record(tx)).rejects.toThrow(
        "Student not found in this Edition"
      );
      expect(insertOperation).not.toHaveBeenCalled();
    }
  );

  it.each([
    undefined,
    { ...volunteer, editionId: "other" },
    { ...volunteer, kind: "guardian" },
    { ...volunteer, state: "archived" },
  ])(
    "rejects missing, cross-Edition, disguised Guardian and inactive volunteers",
    async (subject) => {
      const { tx, insertOperation } = setup([undefined, subject]);
      await expect(
        record(tx, {
          personQr: JSON.stringify({ id: volunteer.id, type: "volunteer" }),
          type: "volunteer_check_in",
        })
      ).rejects.toThrow("Active Volunteer not found");
      expect(insertOperation).not.toHaveBeenCalled();
    }
  );

  it("rejects cross-Edition or inactive yearly IDs", async () => {
    const { tx, insertOperation } = setup([undefined, undefined, undefined]);
    await expect(manual(tx)).rejects.toThrow(
      "Yearly ID not found in this Edition"
    );
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it.each(["qr", "manual"])(
    "preserves meal eligibility for %s",
    async (mode) => {
      const { tx, insertOperation } = setup([undefined, student, []]);
      await expect(
        mode === "qr"
          ? record(tx, { type: "breakfast" })
          : manual(tx, { type: "breakfast" })
      ).rejects.toThrow("Pickup is required before meals");
      expect(insertOperation).not.toHaveBeenCalled();
    }
  );

  it.each(["draft", "registration_open", "registration_locked", "archived"])(
    "rejects new operations in %s",
    async (lifecycle) => {
      const { tx, insertOperation } = setup([undefined], lifecycle);
      await expect(record(tx)).rejects.toThrow("edition_not_live");
      expect(insertOperation).not.toHaveBeenCalled();
    }
  );

  it.each(["live", "archived", "registration_locked"])(
    "replays committed operation without resolving subject in %s",
    async (lifecycle) => {
      const { tx, insertOperation, insertAudit } = setup([existing], lifecycle);
      await record(tx, { type: "venue_departure" });
      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(insertOperation).not.toHaveBeenCalled();
      expect(insertAudit).not.toHaveBeenCalled();
    }
  );

  it("replays manual operation after subject becomes inactive", async () => {
    const { tx, insertOperation } = setup([existing], "archived");
    await manual(tx);
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it("rejects cross-Edition operation ID reuse", async () => {
    const { tx, insertOperation } = setup([
      { ...existing, editionId: "other" },
    ]);
    await expect(record(tx)).rejects.toThrow("Operation ID is already in use");
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it("rejects another operator's operation ID", async () => {
    const { tx, insertOperation } = setup([existing]);
    await expect(
      record(tx, {}, { userId: "other", permissions: ["kalakriti.view"] })
    ).rejects.toThrow("Operation ID is already in use");
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it("deduplicates an effective operation from a second device", async () => {
    const { tx, insertOperation, insertAudit } = setup([
      undefined,
      student,
      [{ ...existing, operationId: "earlier" }],
    ]);
    await record(tx);
    expect(insertOperation).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it.each(["guardian", undefined])(
    "authorizes operator independently for new writes",
    async (kind) => {
      const { tx, insertOperation } = setup([
        undefined,
        student,
        kind ? { id: "operator", kind } : undefined,
      ]);
      await expect(
        record(tx, {}, { userId: "operator", permissions: ["kalakriti.view"] })
      ).rejects.toThrow("Unauthorized");
      expect(insertOperation).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["transport_lead", "pickup", null, true],
    ["liaison", "pickup", "center-1", true],
    ["liaison", "pickup", "other-center", false],
    ["food_lead", "pickup", null, false],
    ["hospitality_lead", "volunteer_check_in", null, true],
    ["transport_lead", "volunteer_check_in", null, false],
    ["food_lead", "breakfast", null, true],
    ["hospitality_lead", "breakfast", null, false],
    ["edition_admin", "pickup", null, true],
  ] as const)(
    "enforces %s permission for %s at %s",
    async (responsibility, type, centerId, allowed) => {
      const isVolunteer = type === "volunteer_check_in";
      const subject = isVolunteer ? volunteer : student;
      const { tx, insertOperation } = setup([
        undefined,
        subject,
        { id: "operator", kind: "volunteer" },
        [{ responsibility, centerId, competitionId: null }],
        type === "breakfast"
          ? [{ ...existing, operationId: "pickup-previous" }]
          : [],
      ]);
      const action = record(
        tx,
        {
          type,
          personQr: JSON.stringify({
            id: subject.id,
            type: isVolunteer ? "volunteer" : "student",
          }),
        },
        { userId: "operator", permissions: ["kalakriti.view"] }
      );
      if (allowed) {
        await action;
        expect(insertOperation).toHaveBeenCalledTimes(1);
      } else {
        await expect(action).rejects.toThrow("Unauthorized");
        expect(insertOperation).not.toHaveBeenCalled();
      }
    }
  );

  it.each(["competition_coordinator", "competition_volunteer"])(
    "allows %s attendance only in assigned competition",
    async (responsibility) => {
      for (const matches of [true, false]) {
        const { tx, insertOperation } = setup([
          undefined,
          student,
          {
            editionId: "edition-1",
            division: {
              id: "division-1",
              editionId: "edition-1",
              competitionId: "competition-1",
            },
          },
          { id: "entry-member" },
          { id: "operator", kind: "volunteer" },
          [
            {
              responsibility,
              competitionId: matches ? "competition-1" : "other",
              centerId: null,
            },
          ],
          [{ ...existing, operationId: "prior-pickup" }],
        ]);
        const action = record(
          tx,
          { type: "competition_attendance", sessionId: "session-1" },
          { userId: "operator", permissions: ["kalakriti.view"] }
        );
        if (matches) {
          await action;
          expect(insertOperation).toHaveBeenCalledTimes(1);
        } else {
          await expect(action).rejects.toThrow("Unauthorized");
          expect(insertOperation).not.toHaveBeenCalled();
        }
      }
    }
  );

  it.each([
    undefined,
    {
      editionId: "other",
      division: {
        id: "division-1",
        editionId: "other",
        competitionId: "competition-1",
      },
    },
    {
      editionId: "edition-1",
      division: {
        id: "division-1",
        editionId: "other",
        competitionId: "competition-1",
      },
    },
  ])(
    "rejects missing or cross-Edition attendance session even for admin",
    async (session) => {
      const { tx, insertOperation } = setup([undefined, student, session]);
      await expect(
        record(tx, { type: "competition_attendance", sessionId: "session-1" })
      ).rejects.toThrow("Competition session not found in this Edition");
      expect(insertOperation).not.toHaveBeenCalled();
    }
  );

  it("rejects attendance for a Student not entered in the session division", async () => {
    const { tx, insertOperation } = setup([
      undefined,
      student,
      {
        editionId: "edition-1",
        division: {
          id: "division-1",
          editionId: "edition-1",
          competitionId: "competition-1",
        },
      },
      undefined,
    ]);
    await expect(
      record(tx, { type: "competition_attendance", sessionId: "session-1" })
    ).rejects.toThrow("Student is not registered");
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it("keeps original-recorder retry safe after permission or lifecycle changes", async () => {
    const { tx, insertOperation } = setup(
      [{ ...existing, recordedBy: "operator" }],
      "archived"
    );
    await record(tx, {}, { userId: "operator", permissions: [] });
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(insertOperation).not.toHaveBeenCalled();
  });

  it("defers authoritative subject resolution on the client", async () => {
    const { tx, insertOperation } = setup();
    await record({ ...tx, location: "client" });
    await manual({ ...tx, location: "client" });
    expect(tx.run).not.toHaveBeenCalled();
    expect(insertOperation).not.toHaveBeenCalled();
  });
});
