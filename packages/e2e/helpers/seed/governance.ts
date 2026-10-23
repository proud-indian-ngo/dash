import {
  ensureAmendedDeedFixture,
  ensureComplianceFixtures,
  ensureDeclarationFixture,
  ensureGovernanceFixtures,
  ensureMeetingFixtures,
  ensurePolicyFixtures,
} from "@pi-dash/db/seed-governance";

export async function ensureGovernanceSeed({
  adminUserId,
  superAdminUserId,
}: {
  adminUserId: string;
  superAdminUserId: string;
}): Promise<void> {
  // A fictional board for the register; specs that change it add their own trustees.
  // The super admin is the Managing Trustee (issues circulars); the admin the
  // Joint Managing Trustee.
  await ensureGovernanceFixtures({
    jointManagingTrusteeUserId: adminUserId,
    managingTrusteeUserId: superAdminUserId,
  });
  await ensureComplianceFixtures();
  // Version 2 of the deed makes a two-trustee quorum possible for the
  // meeting specs; it takes effect on 1 Jan 2026.
  await ensureAmendedDeedFixture();
  await ensureMeetingFixtures();
  await ensurePolicyFixtures();
  await ensureDeclarationFixture("E2E Event Vendor");
}
