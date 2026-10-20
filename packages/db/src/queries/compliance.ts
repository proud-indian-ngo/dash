import {
  COMPLIANCE_HORIZON_DAYS,
  type ComplianceTemplateDefinition,
  DEFAULT_COMPLIANCE_TEMPLATES,
  occurrencesBetween,
} from "@pi-dash/shared/compliance";
import { addDays } from "@pi-dash/shared/governance";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import { complianceItem, complianceTemplate } from "../schema/compliance";
import { organisationRegistration } from "../schema/finance-dimensions";
import { trustee, trusteeTerm } from "../schema/governance";

/**
 * The default calendar, by key. Runs on every server start and in the
 * seeds; a template already there (perhaps edited) is left alone.
 */
export async function ensureComplianceTemplates(): Promise<void> {
  const now = new Date();
  await db
    .insert(complianceTemplate)
    .values(
      DEFAULT_COMPLIANCE_TEMPLATES.map((t) => ({
        active: true,
        createdAt: now,
        dates: t.dates,
        description: t.description,
        id: uuidv7(),
        key: t.key,
        kind: t.kind,
        offsetDays: t.offsetDays,
        registrationType: t.registrationType,
        title: t.title,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing({ target: complianceTemplate.key });
}

/**
 * Creates an item for every occurrence due from today up to the horizon.
 * Idempotent: an occurrence already created (whatever its status) is
 * skipped by its source key. Returns how many were added.
 */
export async function generateComplianceItems(today: string): Promise<number> {
  const to = addDays(today, COMPLIANCE_HORIZON_DAYS);
  const [templates, registrations, terms] = await Promise.all([
    db
      .select()
      .from(complianceTemplate)
      .where(eq(complianceTemplate.active, true)),
    db
      .select({
        id: organisationRegistration.id,
        type: organisationRegistration.type,
        validTo: organisationRegistration.validTo,
      })
      .from(organisationRegistration),
    db
      .select({
        endedOn: trusteeTerm.endedOn,
        endsOn: trusteeTerm.endsOn,
        id: trusteeTerm.id,
        trusteeName: trustee.legalName,
      })
      .from(trusteeTerm)
      .innerJoin(trustee, eq(trustee.id, trusteeTerm.trusteeId))
      .where(isNull(trusteeTerm.endedOn)),
  ]);
  const now = new Date();
  const rows = templates.flatMap((template) =>
    occurrencesBetween(
      template as ComplianceTemplateDefinition,
      { registrations, terms },
      today,
      to
    ).map((occurrence) => ({
      createdAt: now,
      dueOn: occurrence.dueOn,
      fiscalYear: occurrence.fiscalYear,
      id: uuidv7(),
      ownerUserId: template.ownerUserId,
      sourceKey: occurrence.sourceKey,
      status: "open" as const,
      templateId: template.id,
      title: occurrence.title,
      updatedAt: now,
    }))
  );
  if (rows.length === 0) {
    return 0;
  }
  const inserted = await db
    .insert(complianceItem)
    .values(rows)
    .onConflictDoNothing({ target: complianceItem.sourceKey })
    .returning({ id: complianceItem.id });
  return inserted.length;
}

/** Locks an item's row, so two closures of it are checked in turn. */
export async function lockComplianceItem(
  tx: Pick<typeof db, "select">,
  id: string
): Promise<void> {
  await tx
    .select({ id: complianceItem.id })
    .from(complianceItem)
    .where(eq(complianceItem.id, id))
    .for("update");
}

/** Open items due within the next 30 days, for the reminder job. */
export async function openItemsDueSoon(today: string) {
  return await db
    .select({
      dueOn: complianceItem.dueOn,
      id: complianceItem.id,
      ownerUserId: complianceItem.ownerUserId,
      status: complianceItem.status,
      title: complianceItem.title,
    })
    .from(complianceItem)
    .where(
      and(
        eq(complianceItem.status, "open"),
        gte(complianceItem.dueOn, today),
        lte(complianceItem.dueOn, addDays(today, 30))
      )
    );
}
