import { describe, expect, it, mock } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { kalakritiInventoryMutators } from "../kalakriti-inventory";

const editionId = "01950000-0000-7000-8000-000000000001";
const otherEditionId = "01950000-0000-7000-8000-000000000002";
const itemId = "01950000-0000-7000-8000-000000000003";
const secondItemId = "01950000-0000-7000-8000-000000000008";
const volunteerId = "01950000-0000-7000-8000-000000000004";
const competitionId = "01950000-0000-7000-8000-000000000005";
const transactionId = "01950000-0000-7000-8000-000000000006";
const auditEntryId = "01950000-0000-7000-8000-000000000007";
const secondTransactionId = "01950000-0000-7000-8000-000000000009";
const secondAuditEntryId = "01950000-0000-7000-8000-000000000010";
const admin = {
  userId: "admin",
  role: "admin",
  permissions: ["kalakriti.admin"],
};
const staff = {
  userId: "staff",
  role: "volunteer",
  permissions: ["kalakriti.view"],
};
const base = { editionId, itemId, transactionId, auditEntryId, now: 100 };
const item = {
  id: itemId,
  editionId,
  name: "Paint",
  quantity: 8,
  unitPricePaise: 2500,
  archivedAt: null,
  photoKey: null,
};
const recordArgs = {
  ...base,
  type: "purchase" as const,
  quantity: 3,
  expectedQuantity: undefined,
  volunteerMembershipId: null,
  competitionId: null,
  notes: null,
};
const batchArgs = {
  editionId,
  now: 100,
  type: "dispatch" as const,
  volunteerMembershipId: volunteerId,
  competitionId: null,
  notes: null,
  items: [
    { itemId, quantity: 3, transactionId, auditEntryId },
    {
      itemId: secondItemId,
      quantity: 2,
      transactionId: secondTransactionId,
      auditEntryId: secondAuditEntryId,
    },
  ],
};

function setup(
  options: {
    lifecycle?: string;
    quantity?: number;
    secondQuantity?: number;
    archivedAt?: number | null;
    itemEdition?: string;
    memberRole?: string;
    memberState?: string;
    memberEdition?: string;
    volunteerEdition?: string;
    volunteerState?: string;
    competitionEdition?: string;
    competitionRetired?: number | null;
    competitionCancelled?: number | null;
    recipientAssignedCompetition?: boolean;
    recipientAssignedRole?: boolean;
  } = {}
) {
  const order: string[] = [];
  const tables: ScopeTables = {
    kalakritiEdition: [
      {
        id: editionId,
        lifecycle: options.lifecycle ?? "live",
        eventDate: "2027-11-21",
        teamEventId: "event",
        timezone: "Asia/Kolkata",
      },
    ],
    kalakritiInventoryItem: [
      {
        ...item,
        quantity: options.quantity ?? 8,
        archivedAt: options.archivedAt ?? null,
        editionId: options.itemEdition ?? editionId,
      } as unknown as ScopeRow,
      {
        ...item,
        id: secondItemId,
        name: "Paper",
        quantity: options.secondQuantity ?? 6,
      } as unknown as ScopeRow,
    ],
    kalakritiInventoryTransaction: [],
    kalakritiAuditEntry: [],
    kalakritiEditionMembership: [
      {
        id: "staff-membership",
        editionId: options.memberEdition ?? editionId,
        kind: "volunteer",
        state: options.memberState ?? "active",
        userId: "staff",
      },
      {
        id: volunteerId,
        editionId: options.volunteerEdition ?? editionId,
        kind: "volunteer",
        state: options.volunteerState ?? "active",
        userId: "volunteer",
      },
    ],
    kalakritiAssignment: [
      {
        id: "staff-assignment",
        editionId,
        membershipId: "staff-membership",
        responsibility: options.memberRole ?? "logistics_member",
      },
      ...(options.recipientAssignedCompetition === false
        ? []
        : [
            {
              id: "recipient-competition-assignment",
              editionId,
              membershipId: volunteerId,
              responsibility: "competition_volunteer",
              competitionId,
            },
          ]),
      ...(options.recipientAssignedRole === false
        ? []
        : [
            {
              id: "recipient-role-assignment",
              editionId,
              membershipId: volunteerId,
              responsibility: "logistics_member",
              competitionId: null,
            },
          ]),
    ],
    kalakritiCompetition: [
      {
        id: competitionId,
        editionId: options.competitionEdition ?? editionId,
        retiredAt: options.competitionRetired ?? null,
        cancelledAt: options.competitionCancelled ?? null,
      } as unknown as ScopeRow,
    ],
  };
  const insertItem = mock((row: ScopeRow) => {
    order.push("item-insert");
    tables.kalakritiInventoryItem!.push(row);
  });
  const updateItem = mock((patch: ScopeRow) => {
    order.push("item-update");
    Object.assign(
      tables.kalakritiInventoryItem!.find((row) => row.id === patch.id)!,
      patch
    );
  });
  const insertTransaction = mock((row: ScopeRow) => {
    order.push("transaction-insert");
    tables.kalakritiInventoryTransaction!.push(row);
  });
  const insertAudit = mock((row: ScopeRow) => {
    order.push("audit-insert");
    tables.kalakritiAuditEntry!.push(row);
  });
  const run = mock(async (query: { ast: ScopeAst }) => {
    order.push(`read:${query.ast.table}`);
    return (tables[query.ast.table] ?? []).find((row) =>
      matchesScope(row, query.ast.where, tables)
    );
  });
  const tx = {
    location: "client",
    run,
    mutate: {
      kalakritiInventoryItem: { insert: insertItem, update: updateItem },
      kalakritiInventoryTransaction: { insert: insertTransaction },
      kalakritiAuditEntry: { insert: insertAudit },
    },
  };
  return {
    tx,
    tables,
    order,
    insertItem,
    updateItem,
    insertTransaction,
    insertAudit,
  };
}

async function record(tx: unknown, args: object = {}, ctx: object = admin) {
  return kalakritiInventoryMutators.record.fn({
    tx,
    ctx,
    args: { ...recordArgs, ...args },
  } as never);
}

async function recordBatch(
  tx: unknown,
  args: object = {},
  ctx: object = admin
) {
  return kalakritiInventoryMutators.recordBatch.fn({
    tx,
    ctx,
    args: { ...batchArgs, ...args },
  } as never);
}

describe("inventory stock ledger", () => {
  it("claims photos into the item's edition-scoped durable path", async () => {
    const f = setup();
    await kalakritiInventoryMutators.create.fn({
      tx: f.tx,
      ctx: admin,
      args: {
        ...base,
        name: "Brushes",
        openingQuantity: 0,
        unitPricePaise: 0,
        photo: {
          objectKey: "app/kalakriti-inventory/tmp/admin/image.png",
          fileName: "image.png",
          mimeType: "image/png",
          byteSize: 24,
        },
      },
    } as never);
    expect(f.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        photoKey: `app/kalakriti-inventory/${editionId}/${itemId}/image.png`,
        photoName: "image.png",
        photoMimeType: "image/png",
        photoSize: 24,
      })
    );
  });

  it("creates opening stock with its own history and a bounded audit record", async () => {
    const f = setup();
    await kalakritiInventoryMutators.create.fn({
      tx: f.tx,
      ctx: admin,
      args: {
        ...base,
        name: "Brushes",
        openingQuantity: 4,
        unitPricePaise: 1250,
        photo: null,
      },
    } as never);
    expect(f.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 4, unitPricePaise: 1250 })
    );
    expect(f.insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "initial_inventory",
        quantity: 4,
        quantityBefore: 0,
        quantityAfter: 4,
      })
    );
    expect(f.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          itemId,
          changedFields: ["name", "quantity", "unitPricePaise"],
        },
      })
    );
  });

  it.each([
    ["purchase", 3, 11, 3],
    ["dispatch", 3, 5, -3],
    ["return", 3, 11, 3],
    ["adjustment", 2, 2, -6],
  ] as const)(
    "records %s with before/after and signed delta",
    async (type, quantity, after, delta) => {
      const f = setup();
      await record(f.tx, {
        type,
        quantity,
        volunteerMembershipId:
          type === "dispatch" || type === "return" ? volunteerId : null,
        notes: type === "adjustment" ? "Counted" : null,
        expectedQuantity: type === "adjustment" ? 8 : undefined,
      });
      expect(f.insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type,
          quantity: delta,
          quantityBefore: 8,
          quantityAfter: after,
        })
      );
      expect(f.updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: after })
      );
      expect(f.order.indexOf("read:kalakritiEdition")).toBeLessThan(
        f.order.indexOf("read:kalakritiInventoryItem")
      );
    }
  );

  it("rejects stale counts, insufficient dispatches, and overflow without writing", async () => {
    for (const [f, args, error] of [
      [
        setup(),
        {
          type: "adjustment",
          quantity: 2,
          expectedQuantity: 7,
          notes: "Counted",
        },
        "Stock has changed",
      ],
      [
        setup(),
        { type: "dispatch", quantity: 9, volunteerMembershipId: volunteerId },
        "Insufficient stock",
      ],
      [setup({ quantity: 2_147_483_647 }), { quantity: 1 }, "supported limit"],
    ] as const) {
      await expect(record(f.tx, args)).rejects.toThrow(error);
      expect(f.insertTransaction).not.toHaveBeenCalled();
      expect(f.updateItem).not.toHaveBeenCalled();
    }
  });

  it("replays a committed movement without a second stock update", async () => {
    const f = setup();
    await record(f.tx);
    await record(f.tx);
    expect(f.insertTransaction).toHaveBeenCalledTimes(1);
    expect(f.updateItem).toHaveBeenCalledTimes(1);
    expect(f.insertAudit).toHaveBeenCalledTimes(1);
  });

  it("records an assigned role snapshot and replays after the role is revoked", async () => {
    const f = setup();
    const args = {
      type: "dispatch",
      volunteerMembershipId: volunteerId,
      responsibility: "logistics_member",
    };
    await record(f.tx, args);
    expect(f.insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ responsibility: "logistics_member" })
    );
    f.tables.kalakritiAssignment = [];
    await record(f.tx, args);
    expect(f.insertTransaction).toHaveBeenCalledTimes(1);
    await expect(
      record(f.tx, { ...args, responsibility: null })
    ).rejects.toThrow("Transaction ID is already in use");
  });

  it("requires direct recipient assignments for selected roles and competitions", async () => {
    for (const [options, args] of [
      [
        { recipientAssignedRole: false },
        {
          type: "return",
          volunteerMembershipId: volunteerId,
          responsibility: "logistics_member",
        },
      ],
      [
        { recipientAssignedCompetition: false },
        { type: "dispatch", volunteerMembershipId: volunteerId, competitionId },
      ],
    ] as const) {
      const f = setup(options);
      await expect(record(f.tx, args)).rejects.toThrow(
        "no longer assigned to this volunteer"
      );
      expect(f.insertTransaction).not.toHaveBeenCalled();
    }
  });

  it("does not treat another scope or volunteer's assignment as the recipient's role", async () => {
    const competitionScoped = setup();
    await expect(
      record(competitionScoped.tx, {
        type: "dispatch",
        volunteerMembershipId: volunteerId,
        responsibility: "competition_volunteer",
      })
    ).rejects.toThrow("no longer assigned to this volunteer");

    const otherEdition = setup();
    otherEdition.tables.kalakritiAssignment = [
      {
        id: "other-edition-role",
        editionId: otherEditionId,
        membershipId: volunteerId,
        responsibility: "logistics_member",
        competitionId: null,
      },
    ];
    await expect(
      record(otherEdition.tx, {
        type: "return",
        volunteerMembershipId: volunteerId,
        responsibility: "logistics_member",
      })
    ).rejects.toThrow("no longer assigned to this volunteer");

    const otherVolunteer = setup();
    otherVolunteer.tables.kalakritiAssignment = [
      {
        id: "other-volunteer-competition",
        editionId,
        membershipId: "staff-membership",
        responsibility: "competition_volunteer",
        competitionId,
      },
    ];
    await expect(
      record(otherVolunteer.tx, {
        type: "dispatch",
        volunteerMembershipId: volunteerId,
        competitionId,
      })
    ).rejects.toThrow("no longer assigned to this volunteer");
  });

  it("rejects a transaction ID reused for another movement", async () => {
    const f = setup();
    await record(f.tx);
    await expect(
      record(f.tx, { type: "dispatch", volunteerMembershipId: volunteerId })
    ).rejects.toThrow("Transaction ID is already in use");
  });

  it.each([
    ["quantity", { quantity: 4 }, admin],
    ["volunteer", { volunteerMembershipId: volunteerId }, admin],
    ["competition", { competitionId }, admin],
    ["notes", { notes: "Different purpose" }, admin],
    ["responsibility", { responsibility: "logistics_member" }, admin],
    [
      "actor",
      {},
      {
        userId: "another-admin",
        role: "admin",
        permissions: ["kalakriti.admin"],
      },
    ],
  ] as const)(
    "rejects reused transaction ID with changed %s",
    async (_field, changes, replayActor) => {
      const f = setup();
      await record(f.tx);
      await expect(record(f.tx, changes, replayActor)).rejects.toThrow(
        "Transaction ID is already in use"
      );
      expect(f.insertTransaction).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects changed adjustment target or expected starting count on replay", async () => {
    const f = setup();
    const args = {
      type: "adjustment",
      quantity: 2,
      expectedQuantity: 8,
      notes: "Counted",
    };
    await record(f.tx, args);
    await expect(record(f.tx, { ...args, quantity: 3 })).rejects.toThrow(
      "Transaction ID is already in use"
    );
    await expect(
      record(f.tx, { ...args, expectedQuantity: 7 })
    ).rejects.toThrow("Transaction ID is already in use");
    expect(f.insertTransaction).toHaveBeenCalledTimes(1);
  });

  it("replays matching opening stock but rejects a reused ID with changed amount or actor", async () => {
    const f = setup();
    const args = {
      ...base,
      name: "Brushes",
      openingQuantity: 4,
      unitPricePaise: 1250,
      photo: null,
    };
    const create = (changedArgs: object = {}, ctx: object = admin) =>
      kalakritiInventoryMutators.create.fn({
        tx: f.tx,
        ctx,
        args: { ...args, ...changedArgs },
      } as never);
    await create();
    await create();
    await expect(create({ openingQuantity: 5 })).rejects.toThrow(
      "Transaction ID is already in use"
    );
    await expect(
      create(
        {},
        {
          userId: "another-admin",
          role: "admin",
          permissions: ["kalakriti.admin"],
        }
      )
    ).rejects.toThrow("Transaction ID is already in use");
    expect(f.insertItem).toHaveBeenCalledTimes(1);
    expect(f.insertTransaction).toHaveBeenCalledTimes(1);
  });

  it.each(["edition_admin", "logistics_lead", "logistics_member"])(
    "allows active %s writers",
    async (memberRole) => {
      const f = setup({ memberRole });
      await record(f.tx, {}, staff);
      expect(f.insertTransaction).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    { memberRole: "food_member" },
    { memberState: "archived" },
    { memberEdition: otherEditionId },
  ])("rejects unqualified membership %o", async (options) => {
    const f = setup(options);
    await expect(record(f.tx, {}, staff)).rejects.toThrow("Unauthorized");
    expect(f.insertTransaction).not.toHaveBeenCalled();
  });

  it("requires coarse view permission for staff", async () => {
    const f = setup();
    await expect(
      record(f.tx, {}, { userId: "staff", role: "volunteer", permissions: [] })
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects archived Editions and items", async () => {
    const archivedEdition = setup({ lifecycle: "archived" });
    await expect(record(archivedEdition.tx)).rejects.toThrow(
      "Edition is archived"
    );
    const archivedItem = setup({ archivedAt: 1 });
    await expect(record(archivedItem.tx)).rejects.toThrow("Restore this item");
  });

  it("rejects cross-Edition items, volunteers, and competitions", async () => {
    const itemFixture = setup({ itemEdition: otherEditionId });
    await expect(record(itemFixture.tx)).rejects.toThrow(
      "Inventory item not found"
    );
    const volunteerFixture = setup({ volunteerEdition: otherEditionId });
    await expect(
      record(volunteerFixture.tx, {
        type: "dispatch",
        volunteerMembershipId: volunteerId,
      })
    ).rejects.toThrow("Select an active volunteer");
    const competitionFixture = setup({ competitionEdition: otherEditionId });
    await expect(
      record(competitionFixture.tx, { competitionId })
    ).rejects.toThrow("Select an active competition");
  });

  it("rejects inactive volunteers and competitions", async () => {
    const volunteerFixture = setup({ volunteerState: "archived" });
    await expect(
      record(volunteerFixture.tx, {
        type: "return",
        volunteerMembershipId: volunteerId,
      })
    ).rejects.toThrow("Select an active volunteer");
    for (const options of [
      { competitionRetired: 1 },
      { competitionCancelled: 1 },
    ]) {
      const f = setup(options);
      await expect(record(f.tx, { competitionId })).rejects.toThrow(
        "Select an active competition"
      );
    }
  });

  it("requires zero stock to archive and preserves the item on restore", async () => {
    const stocked = setup();
    await expect(
      kalakritiInventoryMutators.archive.fn({
        tx: stocked.tx,
        ctx: admin,
        args: base,
      } as never)
    ).rejects.toThrow("zero stock");
    const empty = setup({ quantity: 0 });
    await kalakritiInventoryMutators.archive.fn({
      tx: empty.tx,
      ctx: admin,
      args: base,
    } as never);
    expect(empty.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ archivedAt: 100 })
    );
    await kalakritiInventoryMutators.restore.fn({
      tx: empty.tx,
      ctx: admin,
      args: base,
    } as never);
    expect(empty.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ archivedAt: null })
    );
  });
});

describe("inventory batch movements", () => {
  it.each([
    ["dispatch", 5, 4, -3, -2],
    ["return", 11, 8, 3, 2],
  ] as const)(
    "records an atomic two-item %s with signed balances and per-item audits",
    async (type, firstAfter, secondAfter, firstDelta, secondDelta) => {
      const f = setup();
      await recordBatch(f.tx, { type, competitionId, notes: "For station A" });
      expect(f.tables.kalakritiInventoryTransaction).toEqual([
        expect.objectContaining({
          id: transactionId,
          quantity: firstDelta,
          quantityBefore: 8,
          quantityAfter: firstAfter,
          volunteerMembershipId: volunteerId,
          competitionId,
          notes: "For station A",
        }),
        expect.objectContaining({
          id: secondTransactionId,
          quantity: secondDelta,
          quantityBefore: 6,
          quantityAfter: secondAfter,
        }),
      ]);
      expect(
        f.tables.kalakritiInventoryItem?.map((row) => Number(row.quantity))
      ).toEqual([firstAfter, secondAfter]);
      expect(f.insertAudit).toHaveBeenCalledTimes(2);
      expect(f.tables.kalakritiAuditEntry).toEqual([
        expect.objectContaining({
          id: auditEntryId,
          action: type,
          targetId: itemId,
          metadata: {
            itemId,
            changedFields: ["quantity"],
            batchAnchorId: transactionId,
            batchSize: 2,
          },
        }),
        expect.objectContaining({
          id: secondAuditEntryId,
          action: type,
          targetId: secondItemId,
          metadata: {
            itemId: secondItemId,
            changedFields: ["quantity"],
            batchAnchorId: transactionId,
            batchSize: 2,
          },
        }),
      ]);
      expect(f.order.indexOf("read:kalakritiEdition")).toBeLessThan(
        f.order.indexOf("read:kalakritiInventoryItem")
      );
    }
  );

  it("preflights every line before any write, including failure on a later item", async () => {
    for (const f of [
      setup({ secondQuantity: 1 }),
      setup({ quantity: 2_147_483_647 }),
    ]) {
      const args =
        Number(f.tables.kalakritiInventoryItem?.[0]?.quantity) === 2_147_483_647
          ? { type: "return" }
          : {};
      await expect(recordBatch(f.tx, args)).rejects.toThrow(
        args.type === "return" ? "supported limit" : "Insufficient stock"
      );
      expect(f.insertTransaction).not.toHaveBeenCalled();
      expect(f.updateItem).not.toHaveBeenCalled();
      expect(f.insertAudit).not.toHaveBeenCalled();
    }
  });

  it("accepts a complete exact replay without changing stock again", async () => {
    const f = setup();
    await recordBatch(f.tx);
    await recordBatch(f.tx);
    expect(f.insertTransaction).toHaveBeenCalledTimes(2);
    expect(f.updateItem).toHaveBeenCalledTimes(2);
    expect(f.insertAudit).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "quantity",
      { items: [{ ...batchArgs.items[0], quantity: 4 }, batchArgs.items[1]] },
    ],
    [
      "volunteer",
      { volunteerMembershipId: "01950000-0000-7000-8000-000000000011" },
    ],
    ["competition", { competitionId }],
    ["responsibility", { responsibility: "logistics_member" }],
    ["notes", { notes: "Changed" }],
    [
      "audit ID",
      {
        items: [
          {
            ...batchArgs.items[0],
            auditEntryId: "01950000-0000-7000-8000-000000000012",
          },
          batchArgs.items[1],
        ],
      },
    ],
    ["timestamp", { now: 101 }],
    [
      "transaction ID",
      {
        items: [
          {
            ...batchArgs.items[0],
            transactionId: "01950000-0000-7000-8000-000000000013",
          },
          batchArgs.items[1],
        ],
      },
    ],
  ] as const)("rejects a %s change on replay", async (_field, changed) => {
    const f = setup();
    await recordBatch(f.tx);
    await expect(recordBatch(f.tx, changed)).rejects.toThrow();
    expect(f.insertTransaction).toHaveBeenCalledTimes(2);
  });

  it("rejects a partially recorded batch", async () => {
    const f = setup();
    await recordBatch(f.tx, { items: [batchArgs.items[0]] });
    await expect(recordBatch(f.tx)).rejects.toThrow();
    expect(f.insertTransaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a replay that omits one originally committed line", async () => {
    const f = setup();
    await recordBatch(f.tx);
    await expect(
      recordBatch(f.tx, { items: [batchArgs.items[0]] })
    ).rejects.toThrow();
    expect(f.insertTransaction).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-Edition and inactive references before writing", async () => {
    for (const [options, args] of [
      [{ itemEdition: otherEditionId }, {}],
      [{ volunteerEdition: otherEditionId }, {}],
      [{ volunteerState: "archived" }, {}],
      [{ competitionEdition: otherEditionId }, { competitionId }],
      [{ competitionCancelled: 1 }, { competitionId }],
      [{ archivedAt: 1 }, {}],
      [{ lifecycle: "archived" }, {}],
    ] as const) {
      const f = setup(options);
      await expect(recordBatch(f.tx, args)).rejects.toThrow();
      expect(f.insertTransaction).not.toHaveBeenCalled();
      expect(f.updateItem).not.toHaveBeenCalled();
    }
  });

  it("stores a role snapshot and accepts an exact batch replay after revocation", async () => {
    const f = setup();
    const args = { responsibility: "logistics_member" };
    await recordBatch(f.tx, args);
    expect(f.tables.kalakritiInventoryTransaction).toEqual([
      expect.objectContaining({ responsibility: "logistics_member" }),
      expect.objectContaining({ responsibility: "logistics_member" }),
    ]);
    f.tables.kalakritiAssignment = [];
    await recordBatch(f.tx, args);
    expect(f.insertTransaction).toHaveBeenCalledTimes(2);
  });

  it("rejects batch role and competition selections without direct assignments", async () => {
    for (const [options, args] of [
      [
        { recipientAssignedRole: false },
        { responsibility: "logistics_member" },
      ],
      [{ recipientAssignedCompetition: false }, { competitionId }],
    ] as const) {
      const f = setup(options);
      await expect(recordBatch(f.tx, args)).rejects.toThrow(
        "no longer assigned to this volunteer"
      );
      expect(f.insertTransaction).not.toHaveBeenCalled();
    }
  });

  it("applies the same writer authorization as single-item movements", async () => {
    const allowed = setup({ memberRole: "logistics_member" });
    await recordBatch(allowed.tx, {}, staff);
    expect(allowed.insertTransaction).toHaveBeenCalledTimes(2);
    const denied = setup({ memberRole: "food_member" });
    await expect(recordBatch(denied.tx, {}, staff)).rejects.toThrow(
      "Unauthorized"
    );
    expect(denied.insertTransaction).not.toHaveBeenCalled();
  });
});
