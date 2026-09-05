import { describe, expect, it } from "bun:test";

import {
  kalakritiAuditEntry,
  kalakritiCredential,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("Kalakriti Guardian membership invariants", () => {
  it("enforces one active Guardian membership per login identity", () => {
    const index = getTableConfig(kalakritiEditionMembership).indexes.find(
      (candidate) =>
        candidate.config.name ===
        "kalakriti_membership_active_guardian_userId_uidx"
    );

    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toHaveLength(1);
    expect(index?.config.where).toBeDefined();
  });
});

describe("Kalakriti credential invariants", () => {
  it("enforces a single subject, Edition ownership, and one active card per subject", () => {
    const config = getTableConfig(kalakritiCredential);
    expect(config.checks.map((check) => check.name)).toContain(
      "kalakriti_credential_subject_chk"
    );
    const subjectKeys = config.foreignKeys.filter((key) =>
      [
        "kalakriti_credential_edition_student_fk",
        "kalakriti_credential_edition_membership_fk",
      ].includes(key.getName())
    );
    expect(subjectKeys).toHaveLength(2);
    for (const key of subjectKeys) {
      expect(key.reference().columns.map((column) => column.name)[0]).toBe(
        "edition_id"
      );
      expect(
        key.reference().foreignColumns.map((column) => column.name)[0]
      ).toBe("edition_id");
    }
    for (const name of [
      "kalakriti_credential_active_studentId_uidx",
      "kalakriti_credential_active_membershipId_uidx",
    ]) {
      const index = config.indexes.find(
        (candidate) => candidate.config.name === name
      );
      expect(index?.config.unique).toBe(true);
      expect(index?.config.where).toBeDefined();
    }
  });

  it("keeps assigned volunteer yearly IDs unique while allowing unissued memberships", () => {
    const index = getTableConfig(kalakritiEditionMembership).indexes.find(
      (candidate) =>
        candidate.config.name === "kalakriti_membership_humanId_uidx"
    );
    expect(index?.config.unique).toBe(true);
    expect(index?.config.columns).toHaveLength(1);
    expect(index?.config.where).toBeDefined();
    expect(kalakritiEditionMembership.humanId.notNull).toBe(false);
  });
});

describe("Kalakriti audit invariants", () => {
  it("retains the immutable actor ID after its User is deleted", () => {
    const foreignKeyNames = getTableConfig(kalakritiAuditEntry).foreignKeys.map(
      (foreignKey) => foreignKey.getName()
    );

    expect(foreignKeyNames).not.toContain(
      "kalakriti_audit_entry_actor_user_id_user_id_fk"
    );
  });
});
