import { db } from "@pi-dash/db";

import { ensureAuditLogEntry } from "./seed/audit";
import {
  ensureR2AuthorizationFixtures,
  ensureZeroQueryAuthorizationFixtures,
} from "./seed/authorization";
import {
  ensureEventVendorPayment,
  ensureEventWithPendingUpdate,
  ensureExpenseCategories,
  ensureRolesAndPermissions,
  ensureTestUsers,
  SEED_EVENT_NAME,
} from "./seed/core";
import { ensureApprovalFixtures, ensureFilterTestEvents } from "./seed/events";
import { ensureGovernanceSeed } from "./seed/governance";
import {
  ensureDonorParty,
  ensureIncomeFixtures,
  ensureReceiptFixtures,
  ensureReturnFixtures,
} from "./seed/income";
import { seedKalakritiReleaseFixture } from "./seed/kalakriti";
import {
  ensureExportVendorPayment,
  ensureReimbursement,
  ensureUpcomingEventReimbursement,
} from "./seed/reimbursements";
import { ensureWhatsAppGroup } from "./seed/scheduled-messages";

async function seed(): Promise<void> {
  await ensureRolesAndPermissions();

  await ensureExpenseCategories();
  await ensureWhatsAppGroup();

  const {
    adminUserId,
    financeAdminUserId,
    superAdminUserId,
    unorientedUserId,
    volunteerUserId,
  } = await ensureTestUsers();

  const teamId = await ensureEventWithPendingUpdate(
    superAdminUserId,
    volunteerUserId
  );
  await seedKalakritiReleaseFixture(superAdminUserId, teamId);
  await ensureZeroQueryAuthorizationFixtures(superAdminUserId, volunteerUserId);
  await ensureFilterTestEvents(teamId, superAdminUserId, volunteerUserId);
  await ensureApprovalFixtures({
    adminUserId: superAdminUserId,
    financeAdminUserId,
    teamId,
    unorientedUserId,
    volunteerUserId,
  });
  await ensureAuditLogEntry(superAdminUserId);
  await ensureGovernanceSeed({ adminUserId, superAdminUserId });
  const pastEvent = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_EVENT_NAME),
  });
  const upcomingEvent = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, "E2E Upcoming Public Bangalore"),
  });
  if (!(pastEvent && upcomingEvent)) {
    throw new Error("E2E event expense fixtures require seeded events");
  }
  await ensureReimbursement(superAdminUserId, pastEvent.id);
  await ensureR2AuthorizationFixtures();
  await ensureEventVendorPayment(superAdminUserId, pastEvent.id);
  await ensureDonorParty(superAdminUserId);
  await ensureIncomeFixtures(superAdminUserId);
  await ensureReturnFixtures(superAdminUserId);
  await ensureReceiptFixtures(superAdminUserId);
  await ensureExportVendorPayment(superAdminUserId);
  await ensureUpcomingEventReimbursement(superAdminUserId, upcomingEvent.id);
}

seed().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown error seeding test users";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
