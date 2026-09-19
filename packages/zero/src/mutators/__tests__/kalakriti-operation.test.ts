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
const attendanceSession = {
  cancelledAt: null,
  editionId: "edition-1",
  division: {
    id: "division-1",
    editionId: "edition-1",
    competitionId: "competition-1",
    competition: {
      id: "competition-1",
      editionId: "edition-1",
      cancelledAt: null,
      competitionCategoryId: "category-1",
      participationMode: "individual",
    },
  },
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

describe("Guest and Judge operations", () => {
  for (const kind of ["guest", "judge"] as const) {
    const attendee = {
      id: "01950000-0000-7000-8000-000000000003",
      editionId: "edition-1",
      kind,
      humanId: "KALX-2027-0001",
      archivedAt: null,
    };
    const checkIn = {
      ...existing,
      operationId: "check-in",
      studentId: null,
      attendeeId: attendee.id,
      type: "attendee_check_in",
    };
    for (const mode of ["qr", "manual"] as const) {
      const command = mode === "qr" ? record : manual;
      const args = {
        personQr: JSON.stringify({ id: attendee.id, type: kind }),
        humanId: attendee.humanId,
        type: "volunteer_check_in",
      };
      const lookup = (subject: unknown = attendee) =>
        mode === "qr"
          ? [undefined, subject]
          : [undefined, undefined, undefined, subject];
      it(`resolves ${kind} ${mode} generic check-in to an attendee-only ledger row`, async () => {
        const { tx, insertOperation, insertAudit } = setup([...lookup(), []]);
        await command(tx, args);
        expect(insertOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            attendeeId: attendee.id,
            membershipId: null,
            studentId: null,
            type: "attendee_check_in",
          })
        );
        expect(insertAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: {
              operationId: baseArgs.operationId,
              subjectKind: kind,
              type: "attendee_check_in",
            },
          })
        );
      });
      it.each([
        "hospitality_lead",
        "hospitality_member",
        "edition_admin",
        "volunteer_coordinator",
        "volunteer_management_volunteer",
      ])(
        `allows %s to check in ${kind} via ${mode}`,
        async (responsibility) => {
          const { tx, insertOperation } = setup([
            ...lookup(),
            volunteer,
            [{ responsibility }],
            [],
          ]);
          await command(tx, args, {
            userId: "staff",
            permissions: ["kalakriti.view"],
          });
          expect(insertOperation).toHaveBeenCalledTimes(1);
        }
      );
      it.each([
        "food_lead",
        "food_member",
        "transport_lead",
        "competition_coordinator",
      ])(`denies %s ${kind} check-in via ${mode}`, async (responsibility) => {
        const { tx, insertOperation } = setup([
          ...lookup(),
          volunteer,
          [{ responsibility }],
        ]);
        await expect(
          command(tx, args, {
            userId: "staff",
            permissions: ["kalakriti.view"],
          })
        ).rejects.toThrow("Unauthorized");
        expect(insertOperation).not.toHaveBeenCalled();
      });
      it.each(["breakfast", "lunch"])(
        `requires check-in for ${kind} %s via ${mode}`,
        async (type) => {
          const missing = setup([...lookup(), []]);
          await expect(command(missing.tx, { ...args, type })).rejects.toThrow(
            "Check-in"
          );
          expect(missing.insertOperation).not.toHaveBeenCalled();
          for (const responsibility of [
            "food_lead",
            "food_member",
            "edition_admin",
          ]) {
            const state = setup([
              ...lookup(),
              volunteer,
              [{ responsibility }],
              [checkIn],
            ]);
            await command(
              state.tx,
              { ...args, type },
              { userId: "staff", permissions: ["kalakriti.view"] }
            );
            expect(state.insertOperation).toHaveBeenCalledWith(
              expect.objectContaining({
                attendeeId: attendee.id,
                membershipId: null,
                type,
              })
            );
          }
          const denied = setup([
            ...lookup(),
            volunteer,
            [{ responsibility: "hospitality_lead" }],
          ]);
          await expect(
            command(
              denied.tx,
              { ...args, type },
              { userId: "staff", permissions: ["kalakriti.view"] }
            )
          ).rejects.toThrow("Unauthorized");
        }
      );
      it.each([
        "pickup",
        "venue_arrival",
        "venue_departure",
        "drop_off",
        "competition_attendance",
      ])(`rejects ${kind} %s via ${mode}`, async (type) => {
        const state = setup(lookup());
        await expect(command(state.tx, { ...args, type })).rejects.toThrow(
          "Student subject"
        );
        expect(state.insertOperation).not.toHaveBeenCalled();
      });
      it.each([
        undefined,
        { ...attendee, archivedAt: 1 },
        { ...attendee, editionId: "other" },
      ])(
        `rejects absent, archived, or foreign ${kind} via ${mode}`,
        async (subject) => {
          const state = setup(lookup(subject === undefined ? null : subject));
          await expect(command(state.tx, args)).rejects.toThrow(
            mode === "qr" ? "Active attendee not found" : "Yearly ID not found"
          );
          expect(state.insertOperation).not.toHaveBeenCalled();
        }
      );
      it.each(["attendee_check_in", "breakfast", "lunch"])(
        `deduplicates effective ${kind} %s via ${mode}`,
        async (type) => {
          const state = setup([...lookup(), [checkIn, { ...checkIn, type }]]);
          await command(state.tx, {
            ...args,
            type: type === "attendee_check_in" ? "volunteer_check_in" : type,
          });
          expect(state.insertOperation).not.toHaveBeenCalled();
          expect(state.insertAudit).not.toHaveBeenCalled();
        }
      );
      it(`preserves ${kind} original-recorder retries before subject and lifecycle validation via ${mode}`, async () => {
        const state = setup([checkIn], "archived");
        await command(state.tx, {
          ...args,
          operationId: checkIn.operationId,
          personQr: JSON.stringify({ id: student.id, type: "student" }),
          humanId: "changed",
        });
        expect(state.tx.run).toHaveBeenCalledTimes(1);
        expect(state.insertOperation).not.toHaveBeenCalled();
        const denied = setup([checkIn]);
        await expect(
          command(
            denied.tx,
            { ...args, operationId: checkIn.operationId },
            { userId: "other", permissions: [] }
          )
        ).rejects.toThrow("Operation ID is already in use");
      });
    }
    it(`rejects a persisted mismatched ${kind} QR kind without membership fallback`, async () => {
      const state = setup([
        undefined,
        { ...attendee, kind: kind === "guest" ? "judge" : "guest" },
      ]);
      await expect(
        record(state.tx, {
          personQr: JSON.stringify({ id: attendee.id, type: kind }),
          type: "volunteer_check_in",
        })
      ).rejects.toThrow("Active attendee not found");
      expect(state.tx.run).toHaveBeenCalledTimes(2);
      expect(state.insertOperation).not.toHaveBeenCalled();
    });
  }
});

describe("Guardian meals", () => {
  const guardian = { ...volunteer, kind: "guardian", humanId: null };
  const args = {
    type: "breakfast",
    personQr: JSON.stringify({ id: guardian.id, type: "guardian" }),
    humanId: guardian.id,
  };
  for (const mode of ["qr", "manual"] as const) {
    const command = mode === "qr" ? record : manual;
    const lookup = (subject: unknown) =>
      mode === "qr" ? [undefined, subject] : [undefined, undefined, subject];
    it.each(["breakfast", "lunch"])(
      `records active Guardian %s via ${mode} without pickup or check-in`,
      async (type) => {
        const { tx, insertOperation, insertAudit } = setup([
          ...lookup(guardian),
          [],
        ]);
        await command(tx, { ...args, type });
        expect(insertOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            membershipId: guardian.id,
            studentId: null,
            type,
          })
        );
        expect(insertAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: {
              operationId: "operation-1",
              subjectKind: "guardian",
              type,
            },
          })
        );
      }
    );
    it.each(["food_lead", "food_member"])(
      `allows %s operators via ${mode}`,
      async (responsibility) => {
        const { tx, insertOperation } = setup([
          ...lookup(guardian),
          volunteer,
          [{ responsibility }],
          [],
        ]);
        await command(tx, args, {
          userId: "food",
          permissions: ["kalakriti.view"],
        });
        expect(insertOperation).toHaveBeenCalledTimes(1);
      }
    );
    it(`does not grant Guardian recording authority via ${mode}`, async () => {
      const { tx, insertOperation } = setup([...lookup(guardian), guardian]);
      await expect(
        command(tx, args, {
          userId: "guardian",
          permissions: ["kalakriti.view"],
        })
      ).rejects.toThrow("Unauthorized");
      expect(insertOperation).not.toHaveBeenCalled();
    });
    it.each([
      { ...guardian, state: "archived" },
      { ...guardian, editionId: "other" },
    ])(
      `rejects inactive or cross-Edition Guardian via ${mode}`,
      async (subject) => {
        const { tx, insertOperation } = setup(lookup(subject));
        await expect(command(tx, args)).rejects.toThrow(
          mode === "qr" ? "Active Guardian not found" : "Yearly ID not found"
        );
        expect(insertOperation).not.toHaveBeenCalled();
      }
    );
    it(`deduplicates a fresh Guardian meal operation ID via ${mode}`, async () => {
      const { tx, insertOperation } = setup([
        ...lookup(guardian),
        [
          {
            ...existing,
            type: "breakfast",
            membershipId: guardian.id,
            studentId: null,
          },
        ],
      ]);
      await command(tx, { ...args, operationId: "fresh" });
      expect(insertOperation).not.toHaveBeenCalled();
    });
    it(`preserves same-ID Guardian retry after Edition ends via ${mode}`, async () => {
      const { tx, insertOperation } = setup(
        [
          {
            ...existing,
            type: "breakfast",
            membershipId: guardian.id,
            studentId: null,
          },
        ],
        "completed"
      );
      await command(tx, args);
      expect(tx.run).toHaveBeenCalledTimes(1);
      expect(insertOperation).not.toHaveBeenCalled();
    });
    it.each([
      "pickup",
      "venue_arrival",
      "venue_departure",
      "drop_off",
      "competition_attendance",
    ])(`rejects Guardian %s via ${mode}`, async (type) => {
      const { tx, insertOperation } = setup(lookup(guardian));
      await expect(command(tx, { ...args, type })).rejects.toThrow(
        "Guardians can only check in or receive meals"
      );
      expect(insertOperation).not.toHaveBeenCalled();
    });
  }
});

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

  it("rejects a Guardian QR without an active matching membership", async () => {
    const { tx, insertOperation } = setup([undefined]);
    await expect(
      record(tx, {
        personQr: JSON.stringify({ id: volunteer.id, type: "guardian" }),
      })
    ).rejects.toThrow("Active Guardian not found in this Edition");
    expect(tx.run).toHaveBeenCalledTimes(2);
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
    ["hospitality_member", "volunteer_check_in", null, true],
    ["food_member", "volunteer_check_in", null, false],
    ["transport_lead", "volunteer_check_in", null, false],
    ["food_lead", "breakfast", null, true],
    ["food_member", "breakfast", null, true],
    ["hospitality_member", "breakfast", null, false],
    ["hospitality_member", "pickup", null, false],
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
          attendanceSession,
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
      attendanceSession,
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

  it.each(["qr", "manual"])(
    "rejects cancelled attendance sessions through %s, even for administrators",
    async (mode) => {
      const { tx, insertOperation, insertAudit } = setup([
        undefined,
        student,
        { ...attendanceSession, cancelledAt: 123 },
      ]);
      const args = { type: "competition_attendance", sessionId: "session-1" };
      await expect(
        mode === "qr" ? record(tx, args) : manual(tx, args)
      ).rejects.toThrow("Competition session is cancelled");
      expect(insertOperation).not.toHaveBeenCalled();
      expect(insertAudit).not.toHaveBeenCalled();
    }
  );

  it.each(["qr", "manual"])(
    "combines hospitality and food assignments without granting transport via %s",
    async (mode) => {
      for (const type of [
        "volunteer_check_in",
        "breakfast",
        "lunch",
      ] as const) {
        const { tx, insertOperation } = setup([
          undefined,
          ...(mode === "manual" ? [undefined] : []),
          volunteer,
          { id: "operator", kind: "volunteer" },
          [
            {
              responsibility: "food_member",
              centerId: null,
              competitionId: null,
            },
            {
              responsibility: "hospitality_member",
              centerId: null,
              competitionId: null,
            },
          ],
          type === "volunteer_check_in"
            ? []
            : [
                {
                  ...existing,
                  membershipId: volunteer.id,
                  studentId: null,
                  type: "volunteer_check_in",
                  operationId: "check-in",
                },
              ],
        ]);
        const args = {
          type,
          personQr: JSON.stringify({ id: volunteer.id, type: "volunteer" }),
          humanId: volunteer.humanId,
        };
        const ctx = { userId: "operator", permissions: ["kalakriti.view"] };
        await (mode === "qr" ? record(tx, args, ctx) : manual(tx, args, ctx));
        expect(insertOperation).toHaveBeenCalledWith(
          expect.objectContaining({
            type,
            membershipId: volunteer.id,
            studentId: null,
          })
        );
      }
    }
  );

  it.each(["breakfast", "lunch"])(
    "requires Student pickup or Volunteer check-in for %s through both inputs",
    async (type) => {
      for (const mode of ["qr", "manual"]) {
        for (const isVolunteer of [false, true]) {
          const subject = isVolunteer ? volunteer : student;
          const { tx, insertOperation } = setup([
            undefined,
            ...(mode === "manual" && isVolunteer ? [undefined] : []),
            subject,
            [],
          ]);
          const args = {
            type,
            humanId: subject.humanId,
            personQr: JSON.stringify({
              id: subject.id,
              type: isVolunteer ? "volunteer" : "student",
            }),
          };
          await expect(
            mode === "qr" ? record(tx, args) : manual(tx, args)
          ).rejects.toThrow(
            isVolunteer ? "Check-in is required" : "Pickup is required"
          );
          expect(insertOperation).not.toHaveBeenCalled();
        }
      }
    }
  );

  it.each([
    "volunteer_check_in",
    "breakfast",
    "lunch",
    "competition_attendance",
  ])(
    "deduplicates fresh operation IDs for already-effective %s through QR and manual inputs",
    async (type) => {
      for (const mode of ["qr", "manual"]) {
        const isVolunteer = type === "volunteer_check_in";
        const subject = isVolunteer ? volunteer : student;
        const sessionId =
          type === "competition_attendance" ? "session-1" : undefined;
        const previous = {
          ...existing,
          type,
          operationId: "earlier",
          membershipId: isVolunteer ? volunteer.id : null,
          studentId: isVolunteer ? null : student.id,
          competitionSessionId: sessionId ?? null,
        };
        const { tx, insertOperation, insertAudit } = setup([
          undefined,
          ...(mode === "manual" && isVolunteer ? [undefined] : []),
          subject,
          ...(sessionId ? [attendanceSession, { id: "entry-member" }] : []),
          [previous],
        ]);
        const args = {
          type,
          sessionId,
          humanId: subject.humanId,
          personQr: JSON.stringify({
            id: subject.id,
            type: isVolunteer ? "volunteer" : "student",
          }),
        };
        await (mode === "qr" ? record(tx, args) : manual(tx, args));
        expect(insertOperation).not.toHaveBeenCalled();
        expect(insertAudit).not.toHaveBeenCalled();
      }
    }
  );

  it("does not let attendance for a different session suppress a valid new mark", async () => {
    const { tx, insertOperation } = setup([
      undefined,
      student,
      attendanceSession,
      { id: "entry-member" },
      [
        { ...existing, operationId: "pickup" },
        {
          ...existing,
          type: "competition_attendance",
          competitionSessionId: "other-session",
          operationId: "earlier-attendance",
        },
      ],
    ]);
    await record(tx, {
      type: "competition_attendance",
      sessionId: "session-1",
    });
    expect(insertOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "competition_attendance",
        competitionSessionId: "session-1",
      })
    );
  });

  it("does not let a superseded check-in suppress a new check-in", async () => {
    const { tx, insertOperation } = setup([
      undefined,
      volunteer,
      [
        {
          ...existing,
          type: "volunteer_check_in",
          membershipId: volunteer.id,
          studentId: null,
          operationId: "old",
          supersededByOperationId: "replacement",
        },
      ],
    ]);
    await record(tx, {
      type: "volunteer_check_in",
      personQr: JSON.stringify({ id: volunteer.id, type: "volunteer" }),
    });
    expect(insertOperation).toHaveBeenCalledTimes(1);
  });

  it("preserves committed attendance replay before lifecycle, cancellation, and changed-subject checks", async () => {
    const { tx, insertOperation, insertAudit } = setup(
      [
        {
          ...existing,
          type: "competition_attendance",
          competitionSessionId: "session-1",
        },
      ],
      "archived"
    );
    await record(tx, {
      type: "competition_attendance",
      sessionId: "cancelled-session",
      personQr: JSON.stringify({ id: volunteer.id, type: "guardian" }),
    });
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(insertOperation).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it.each(["qr", "manual"])(
    "rejects cancelled parent Competition through %s without depending on session cancellation",
    async (mode) => {
      const session = {
        ...attendanceSession,
        division: {
          ...attendanceSession.division,
          competition: {
            ...attendanceSession.division.competition,
            cancelledAt: 123,
          },
        },
      };
      const { tx, insertOperation, insertAudit } = setup([
        undefined,
        student,
        session,
      ]);
      const args = { type: "competition_attendance", sessionId: "session-1" };
      await expect(
        mode === "qr" ? record(tx, args) : manual(tx, args)
      ).rejects.toThrow("Competition is cancelled");
      expect(insertOperation).not.toHaveBeenCalled();
      expect(insertAudit).not.toHaveBeenCalled();
    }
  );

  it.each([
    undefined,
    { id: "competition-1", editionId: "other", cancelledAt: null },
    { id: "other", editionId: "edition-1", cancelledAt: null },
  ])(
    "rejects missing or mismatched parent Competition for attendance",
    async (competition) => {
      const { tx, insertOperation } = setup([
        undefined,
        student,
        {
          ...attendanceSession,
          division: { ...attendanceSession.division, competition },
        },
      ]);
      await expect(
        record(tx, { type: "competition_attendance", sessionId: "session-1" })
      ).rejects.toThrow("Competition not found in this Edition");
      expect(insertOperation).not.toHaveBeenCalled();
    }
  );

  it("replays committed attendance without querying a subsequently cancelled parent Competition", async () => {
    const { tx, insertOperation, insertAudit } = setup([
      {
        ...existing,
        type: "competition_attendance",
        competitionSessionId: "session-1",
      },
    ]);
    await record(tx, {
      type: "competition_attendance",
      sessionId: "session-1",
    });
    expect(tx.run).toHaveBeenCalledTimes(1);
    expect(insertOperation).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("defers authoritative subject resolution on the client", async () => {
    const { tx, insertOperation } = setup();
    await record({ ...tx, location: "client" });
    await manual({ ...tx, location: "client" });
    expect(tx.run).not.toHaveBeenCalled();
    expect(insertOperation).not.toHaveBeenCalled();
  });
});

describe("Volunteer Management check-in", () => {
  for (const kind of ["guardian", "volunteer"] as const) {
    for (const mode of ["qr", "manual"] as const) {
      it.each(["volunteer_coordinator", "volunteer_management_volunteer"])(
        `allows %s to check in ${kind} via ${mode}`,
        async (responsibility) => {
          const subject = {
            ...volunteer,
            kind,
            humanId: kind === "guardian" ? "KALG-2027-0001" : volunteer.humanId,
          };
          const { tx, insertOperation } = setup([
            undefined,
            ...(mode === "manual" ? [undefined] : []),
            subject,
            volunteer,
            [{ responsibility }],
            [],
          ]);
          await (mode === "qr" ? record : manual)(
            tx,
            {
              type: "volunteer_check_in",
              humanId: subject.humanId,
              personQr: JSON.stringify({ id: subject.id, type: kind }),
            },
            { userId: "operator", permissions: ["kalakriti.view"] }
          );
          expect(insertOperation).toHaveBeenCalledWith(
            expect.objectContaining({
              type:
                kind === "guardian"
                  ? "guardian_check_in"
                  : "volunteer_check_in",
              membershipId: subject.id,
              studentId: null,
              attendeeId: null,
            })
          );
        }
      );
    }
  }
  it("does not grant hospitality staff Guardian check-in", async () => {
    const guardian = { ...volunteer, kind: "guardian" };
    const { tx, insertOperation } = setup([
      undefined,
      guardian,
      volunteer,
      [{ responsibility: "hospitality_member" }],
    ]);
    await expect(
      record(
        tx,
        {
          type: "volunteer_check_in",
          personQr: JSON.stringify({ id: guardian.id, type: "guardian" }),
        },
        { userId: "operator", permissions: ["kalakriti.view"] }
      )
    ).rejects.toThrow("Unauthorized");
    expect(insertOperation).not.toHaveBeenCalled();
  });
  it("deduplicates Guardian check-in across fresh scans", async () => {
    const guardian = { ...volunteer, kind: "guardian" };
    const { tx, insertOperation } = setup([
      undefined,
      guardian,
      [
        {
          ...existing,
          type: "guardian_check_in",
          studentId: null,
          membershipId: guardian.id,
          operationId: "earlier",
        },
      ],
    ]);
    await record(tx, {
      type: "volunteer_check_in",
      personQr: JSON.stringify({ id: guardian.id, type: "guardian" }),
    });
    expect(insertOperation).not.toHaveBeenCalled();
  });
});

describe("Competition lead attendance", () => {
  it.each([
    ["overall_events_lead", null, true],
    ["competition_category_lead", "category-1", true],
    ["competition_category_lead", "other", false],
    ["competition_category_lead", null, false],
    ["volunteer_management_volunteer", null, false],
  ] as const)(
    "scopes %s category %s",
    async (responsibility, competitionCategoryId, allowed) => {
      const { tx, insertOperation } = setup([
        undefined,
        student,
        attendanceSession,
        { id: "entry-member" },
        volunteer,
        [{ responsibility, competitionCategoryId }],
        [{ ...existing, operationId: "pickup" }],
      ]);
      const action = record(
        tx,
        { type: "competition_attendance", sessionId: "session-1" },
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
});

describe("Group competition attendance", () => {
  it.each(["qr", "manual"] as const)(
    "marks only present teammates via %s",
    async (mode) => {
      const groupSession = {
        ...attendanceSession,
        division: {
          ...attendanceSession.division,
          competition: {
            ...attendanceSession.division.competition,
            participationMode: "group",
          },
        },
      };
      const operations = (id: string, present: boolean, attended = false) => [
        { ...existing, operationId: `pickup-${id}`, studentId: id },
        ...(present
          ? [
              {
                ...existing,
                type: "venue_arrival",
                operationId: `arrival-${id}`,
                studentId: id,
              },
            ]
          : []),
        ...(attended
          ? [
              {
                ...existing,
                type: "competition_attendance",
                competitionSessionId: "session-1",
                operationId: `attendance-${id}`,
                studentId: id,
              },
            ]
          : []),
      ];
      const { tx, insertOperation, insertAudit } = setup([
        undefined,
        student,
        groupSession,
        { id: "entry-member", entryId: "group-1" },
        operations(student.id, true),
        [
          {
            studentId: student.id,
            student: { operations: operations(student.id, true) },
          },
          {
            studentId: "present",
            student: { operations: operations("present", true) },
          },
          {
            studentId: "absent",
            student: { operations: operations("absent", false) },
          },
          {
            studentId: "attended",
            student: { operations: operations("attended", true, true) },
          },
        ],
      ]);
      await (mode === "qr" ? record : manual)(tx, {
        type: "competition_attendance",
        sessionId: "session-1",
      });
      expect(insertOperation).toHaveBeenCalledTimes(2);
      expect(insertOperation.mock.calls.map(([row]) => row.studentId)).toEqual([
        student.id,
        "present",
      ]);
      expect(insertOperation.mock.calls[1]?.[0]).toMatchObject({
        competitionSessionId: "session-1",
        recordedBy: adminContext.userId,
      });
      expect(insertAudit).toHaveBeenCalledTimes(2);
      expect(insertAudit.mock.calls[1]?.[0].metadata).toMatchObject({
        initiatingOperationId: baseArgs.operationId,
        entryId: "group-1",
      });
      const groupQuery = tx.run.mock.calls.at(-1)?.[0];
      expect(JSON.stringify(groupQuery?.ast)).toContain("group-1");
    }
  );
});
