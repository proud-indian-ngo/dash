import { KALAKRITI_INVENTORY_RESPONSIBILITIES } from "@pi-dash/shared/kalakriti-inventory";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import type z from "zod";

import type { Context } from "../context";
import {
  inventoryArchiveSchema,
  inventoryCreateSchema,
  inventoryRecordBatchSchema,
  inventoryRecordSchema,
  inventoryUpdateSchema,
} from "../kalakriti-inventory-schema";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import { getEditionForUpdate } from "./kalakriti-row-locks";
import {
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
  enqueueDeleteR2Object,
} from "./submission-helpers";

async function authorize(
  tx: Transaction,
  ctx: Context | undefined,
  editionId: string
) {
  assertIsLoggedIn(ctx);
  // Every inventory writer takes the Edition lock before reading any balance.
  const edition = await getEditionForUpdate(tx, editionId);
  if (!edition) throw new Error("Edition not found");
  if (edition.lifecycle === "archived") throw new Error("Edition is archived");
  if (can(ctx, "kalakriti.admin")) return;
  assertHasPermission(ctx, "kalakriti.view");
  const membership = await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("kind", "volunteer")
      .where("state", "active")
      .whereExists("assignments", (assignment) =>
        assignment
          .where("editionId", editionId)
          .where("responsibility", "IN", [
            ...KALAKRITI_INVENTORY_RESPONSIBILITIES,
          ])
      )
      .one()
  );
  if (!membership) throw new Error("Unauthorized");
}

async function getItem(tx: Transaction, editionId: string, itemId: string) {
  const item = await tx.run(
    zql.kalakritiInventoryItem
      .where("id", itemId)
      .where("editionId", editionId)
      .one()
  );
  if (!item) throw new Error("Inventory item not found in this Edition");
  return item;
}

async function validateRecipientAssignment(
  tx: Transaction,
  args: {
    editionId: string;
    volunteerMembershipId: string;
    competitionId: string | null;
    responsibility?: z.infer<
      typeof inventoryRecordBatchSchema
    >["responsibility"];
  }
) {
  if (!args.competitionId && !args.responsibility) return;
  let assignment = zql.kalakritiAssignment
    .where("editionId", args.editionId)
    .where("membershipId", args.volunteerMembershipId);
  if (args.competitionId) {
    assignment = assignment.where("competitionId", args.competitionId);
  } else {
    assignment = assignment
      .where("competitionId", "IS", null)
      .where("responsibility", args.responsibility!);
  }
  if (!(await tx.run(assignment.one())))
    throw new Error(
      "The selected role or competition is no longer assigned to this volunteer"
    );
}

function claimPhoto(
  tx: Transaction,
  ctx: Context,
  args: Pick<
    z.infer<typeof inventoryCreateSchema>,
    "editionId" | "itemId" | "photo"
  >
) {
  const photo = args.photo;
  return {
    photoKey: photo
      ? claimUploadedR2ObjectKey(
          photo.objectKey,
          createR2ClaimOptions(ctx, tx.location, {
            subfolder: "kalakriti-inventory",
            durablePrefix: `${args.editionId}/${args.itemId}`,
            mimeType: photo.mimeType,
            byteSize: photo.byteSize,
          })
        )
      : null,
    photoName: photo?.fileName ?? null,
    photoMimeType: photo?.mimeType ?? null,
    photoSize: photo?.byteSize ?? null,
  };
}

function audit(
  tx: Transaction,
  ctx: Context,
  args: z.infer<typeof inventoryArchiveSchema>,
  action: string,
  changedFields: string[],
  batch?: { batchAnchorId: string; batchSize: number }
) {
  return tx.mutate.kalakritiAuditEntry.insert({
    id: args.auditEntryId,
    editionId: args.editionId,
    actorUserId: ctx.userId,
    createdAt: args.now,
    domain: "inventory",
    targetType: "inventory_item",
    targetId: args.itemId,
    action,
    metadata: { itemId: args.itemId, changedFields, ...batch },
    reason: null,
  });
}

async function setArchived(
  tx: Transaction,
  ctx: Context | undefined,
  args: z.infer<typeof inventoryArchiveSchema>,
  archived: boolean
) {
  await authorize(tx, ctx, args.editionId);
  assertIsLoggedIn(ctx);
  const item = await getItem(tx, args.editionId, args.itemId);
  if ((item.archivedAt !== null) === archived) return;
  if (archived && item.quantity !== 0)
    throw new Error("Only items with zero stock can be archived");
  await tx.mutate.kalakritiInventoryItem.update({
    id: item.id,
    archivedAt: archived ? args.now : null,
    updatedAt: args.now,
  });
  await audit(tx, ctx, args, archived ? "archived" : "restored", [
    "archivedAt",
  ]);
}

export const kalakritiInventoryMutators = {
  create: defineMutator(inventoryCreateSchema, async ({ tx, ctx, args }) => {
    await authorize(tx, ctx, args.editionId);
    assertIsLoggedIn(ctx);
    const existing = await tx.run(
      zql.kalakritiInventoryTransaction.where("id", args.transactionId).one()
    );
    if (existing) {
      if (
        existing.editionId !== args.editionId ||
        existing.itemId !== args.itemId ||
        existing.type !== "initial_inventory" ||
        existing.quantity !== args.openingQuantity ||
        existing.actorUserId !== ctx.userId
      )
        throw new Error("Transaction ID is already in use");
      return;
    }
    await tx.mutate.kalakritiInventoryItem.insert({
      id: args.itemId,
      editionId: args.editionId,
      name: args.name,
      quantity: args.openingQuantity,
      unitPricePaise: args.unitPricePaise,
      ...claimPhoto(tx, ctx, args),
      archivedAt: null,
      createdAt: args.now,
      updatedAt: args.now,
    });
    await tx.mutate.kalakritiInventoryTransaction.insert({
      id: args.transactionId,
      editionId: args.editionId,
      itemId: args.itemId,
      type: "initial_inventory",
      quantity: args.openingQuantity,
      quantityBefore: 0,
      quantityAfter: args.openingQuantity,
      volunteerMembershipId: null,
      competitionId: null,
      responsibility: null,
      notes: null,
      actorUserId: ctx.userId,
      createdAt: args.now,
    });
    await audit(tx, ctx, args, "created", [
      "name",
      "quantity",
      "unitPricePaise",
      ...(args.photo ? ["photo"] : []),
    ]);
  }),
  update: defineMutator(inventoryUpdateSchema, async ({ tx, ctx, args }) => {
    await authorize(tx, ctx, args.editionId);
    assertIsLoggedIn(ctx);
    const item = await getItem(tx, args.editionId, args.itemId);
    if (item.archivedAt !== null)
      throw new Error("Restore this item before editing it");
    const changedFields = [
      ...(item.name !== args.name ? ["name"] : []),
      ...(item.unitPricePaise !== args.unitPricePaise
        ? ["unitPricePaise"]
        : []),
      ...(args.photo !== undefined ? ["photo"] : []),
    ];
    if (changedFields.length === 0) return;
    const photo =
      args.photo === undefined
        ? undefined
        : claimPhoto(tx, ctx, { ...args, photo: args.photo });
    await tx.mutate.kalakritiInventoryItem.update({
      id: args.itemId,
      name: args.name,
      unitPricePaise: args.unitPricePaise,
      ...photo,
      updatedAt: args.now,
    });
    if (photo && item.photoKey && item.photoKey !== photo.photoKey) {
      enqueueDeleteR2Object(ctx, tx.location, item.photoKey, {
        keyPrefixes: ["kalakriti-inventory/"],
        meta: { mutator: "kalakritiInventory.update", itemId: item.id },
      });
    }
    await audit(tx, ctx, args, "updated", changedFields);
  }),
  archive: defineMutator(inventoryArchiveSchema, ({ tx, ctx, args }) =>
    setArchived(tx, ctx, args, true)
  ),
  restore: defineMutator(inventoryArchiveSchema, ({ tx, ctx, args }) =>
    setArchived(tx, ctx, args, false)
  ),
  record: defineMutator(inventoryRecordSchema, async ({ tx, ctx, args }) => {
    await authorize(tx, ctx, args.editionId);
    assertIsLoggedIn(ctx);
    const existing = await tx.run(
      zql.kalakritiInventoryTransaction.where("id", args.transactionId).one()
    );
    if (existing) {
      const originalQuantity =
        args.type === "adjustment"
          ? existing.quantityAfter
          : Math.abs(existing.quantity);
      if (
        existing.editionId !== args.editionId ||
        existing.itemId !== args.itemId ||
        existing.type !== args.type ||
        originalQuantity !== args.quantity ||
        existing.actorUserId !== ctx.userId ||
        existing.volunteerMembershipId !== args.volunteerMembershipId ||
        existing.competitionId !== args.competitionId ||
        existing.responsibility !== (args.responsibility ?? null) ||
        existing.notes !== (args.notes || null) ||
        (args.type === "adjustment" &&
          existing.quantityBefore !== args.expectedQuantity)
      )
        throw new Error("Transaction ID is already in use");
      return;
    }
    const item = await getItem(tx, args.editionId, args.itemId);
    if (item.archivedAt !== null)
      throw new Error("Restore this item before recording stock movements");
    if (args.volunteerMembershipId) {
      const volunteer = await tx.run(
        zql.kalakritiEditionMembership
          .where("id", args.volunteerMembershipId)
          .where("editionId", args.editionId)
          .where("kind", "volunteer")
          .where("state", "active")
          .one()
      );
      if (!volunteer)
        throw new Error("Select an active volunteer from this Edition");
    }
    if (args.competitionId) {
      const competition = await tx.run(
        zql.kalakritiCompetition
          .where("id", args.competitionId)
          .where("editionId", args.editionId)
          .where("retiredAt", "IS", null)
          .where("cancelledAt", "IS", null)
          .one()
      );
      if (!competition)
        throw new Error("Select an active competition from this Edition");
    }
    if (
      (args.type === "dispatch" || args.type === "return") &&
      args.volunteerMembershipId
    ) {
      await validateRecipientAssignment(tx, {
        editionId: args.editionId,
        volunteerMembershipId: args.volunteerMembershipId,
        competitionId: args.competitionId,
        responsibility: args.responsibility,
      });
    }
    if (args.type === "adjustment" && args.expectedQuantity !== item.quantity)
      throw new Error(
        "Stock has changed. Review the current balance before adjusting it."
      );
    let quantityAfter = item.quantity + args.quantity;
    if (args.type === "dispatch") quantityAfter = item.quantity - args.quantity;
    if (args.type === "adjustment") quantityAfter = args.quantity;
    if (quantityAfter < 0)
      throw new Error("Insufficient stock for this dispatch");
    if (quantityAfter > 2_147_483_647)
      throw new Error("Stock quantity exceeds the supported limit");
    await tx.mutate.kalakritiInventoryTransaction.insert({
      id: args.transactionId,
      editionId: args.editionId,
      itemId: args.itemId,
      type: args.type,
      quantity: quantityAfter - item.quantity,
      quantityBefore: item.quantity,
      quantityAfter,
      volunteerMembershipId: args.volunteerMembershipId,
      competitionId: args.competitionId,
      responsibility: args.responsibility ?? null,
      notes: args.notes || null,
      actorUserId: ctx.userId,
      createdAt: args.now,
    });
    await tx.mutate.kalakritiInventoryItem.update({
      id: item.id,
      quantity: quantityAfter,
      updatedAt: args.now,
    });
    await audit(tx, ctx, args, args.type, ["quantity"]);
  }),
  recordBatch: defineMutator(
    inventoryRecordBatchSchema,
    async ({ tx, ctx, args }) => {
      await authorize(tx, ctx, args.editionId);
      assertIsLoggedIn(ctx);

      // A complete, identical replay is safe. A partly applied or reused ID
      // must never turn a retry into a second movement.
      let replayed = 0;
      for (const line of args.items) {
        const [existing, existingAudit] = await Promise.all([
          tx.run(
            zql.kalakritiInventoryTransaction
              .where("id", line.transactionId)
              .one()
          ),
          tx.run(zql.kalakritiAuditEntry.where("id", line.auditEntryId).one()),
        ]);
        if (existing) {
          replayed++;
          if (
            existing.editionId !== args.editionId ||
            existing.itemId !== line.itemId ||
            existing.type !== args.type ||
            existing.quantity !==
              (args.type === "dispatch" ? -line.quantity : line.quantity) ||
            existing.volunteerMembershipId !== args.volunteerMembershipId ||
            existing.competitionId !== args.competitionId ||
            existing.responsibility !== (args.responsibility ?? null) ||
            existing.notes !== (args.notes || null) ||
            existing.actorUserId !== ctx.userId ||
            existing.createdAt !== args.now ||
            !existingAudit ||
            existingAudit.editionId !== args.editionId ||
            existingAudit.targetId !== line.itemId ||
            existingAudit.action !== args.type ||
            existingAudit.actorUserId !== ctx.userId ||
            existingAudit.createdAt !== args.now ||
            existingAudit.metadata?.batchAnchorId !==
              args.items[0]?.transactionId ||
            existingAudit.metadata?.batchSize !== args.items.length
          )
            throw new Error("Transaction ID is already in use");
        } else if (existingAudit) {
          throw new Error("Audit entry ID is already in use");
        }
      }
      if (replayed === args.items.length) return;
      if (replayed !== 0)
        throw new Error(
          "Batch was only partly recorded; review stock before retrying"
        );

      const volunteer = await tx.run(
        zql.kalakritiEditionMembership
          .where("id", args.volunteerMembershipId)
          .where("editionId", args.editionId)
          .where("kind", "volunteer")
          .where("state", "active")
          .one()
      );
      if (!volunteer)
        throw new Error("Select an active volunteer from this Edition");
      if (args.competitionId) {
        const competition = await tx.run(
          zql.kalakritiCompetition
            .where("id", args.competitionId)
            .where("editionId", args.editionId)
            .where("retiredAt", "IS", null)
            .where("cancelledAt", "IS", null)
            .one()
        );
        if (!competition)
          throw new Error("Select an active competition from this Edition");
      }
      await validateRecipientAssignment(tx, args);

      const changes = [];
      for (const line of args.items) {
        const item = await getItem(tx, args.editionId, line.itemId);
        if (item.archivedAt !== null)
          throw new Error("Restore this item before recording stock movements");
        const quantityAfter =
          item.quantity +
          (args.type === "dispatch" ? -line.quantity : line.quantity);
        if (quantityAfter < 0)
          throw new Error("Insufficient stock for this dispatch");
        if (quantityAfter > 2_147_483_647)
          throw new Error("Stock quantity exceeds the supported limit");
        changes.push({ line, item, quantityAfter });
      }

      for (const { line, item, quantityAfter } of changes) {
        await tx.mutate.kalakritiInventoryTransaction.insert({
          id: line.transactionId,
          editionId: args.editionId,
          itemId: line.itemId,
          type: args.type,
          quantity: quantityAfter - item.quantity,
          quantityBefore: item.quantity,
          quantityAfter,
          volunteerMembershipId: args.volunteerMembershipId,
          competitionId: args.competitionId,
          responsibility: args.responsibility ?? null,
          notes: args.notes || null,
          actorUserId: ctx.userId,
          createdAt: args.now,
        });
        await tx.mutate.kalakritiInventoryItem.update({
          id: line.itemId,
          quantity: quantityAfter,
          updatedAt: args.now,
        });
        await audit(
          tx,
          ctx,
          {
            editionId: args.editionId,
            itemId: line.itemId,
            auditEntryId: line.auditEntryId,
            now: args.now,
          },
          args.type,
          ["quantity"],
          {
            batchAnchorId: args.items[0]!.transactionId,
            batchSize: args.items.length,
          }
        );
      }
    }
  ),
};
