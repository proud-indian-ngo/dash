import { describe, expect, it } from "vitest";

import {
  leadApprovalStateOf,
  leadApproverOf,
  leadStepOutstanding,
} from "./approval-policy";
import { PROGRAMME_IDS } from "./constants";

const leads: Record<string, string | null> = {
  arts: "lead-arts",
  edu: "lead-edu",
  nolead: null,
  [PROGRAMME_IDS.unallocated]: "lead-edu",
};
const leadOf = (programmeId: string) => leads[programmeId];

const onProgramme = (programmeId: string, extra = {}) => ({
  chargedProgrammeId: programmeId,
  chargedTo: "programme" as const,
  createdBy: "claimant",
  userId: "claimant",
  ...extra,
});

describe("leadApproverOf", () => {
  it("is the lead of the programme the request is charged to", () => {
    expect(leadApproverOf(onProgramme("edu"), leadOf)).toBe("lead-edu");
    expect(
      leadApproverOf(
        {
          chargedTo: "event",
          event: { programmeId: "arts" },
          userId: "claimant",
        },
        leadOf
      )
    ).toBe("lead-arts");
  });

  it("skips the lead step for admin, Unallocated, no lead and the lead's own", () => {
    expect(
      leadApproverOf({ chargedTo: "organisation", userId: "claimant" }, leadOf)
    ).toBeNull();
    expect(
      leadApproverOf(onProgramme(PROGRAMME_IDS.unallocated), leadOf)
    ).toBeNull();
    expect(leadApproverOf(onProgramme("nolead"), leadOf)).toBeNull();
    expect(
      leadApproverOf(onProgramme("edu", { userId: "lead-edu" }), leadOf)
    ).toBeNull();
    expect(
      leadApproverOf(onProgramme("edu", { createdBy: "lead-edu" }), leadOf)
    ).toBeNull();
  });
});

describe("leadApprovalStateOf", () => {
  it("waits for the lead only while pending", () => {
    expect(
      leadApprovalStateOf({ status: "pending", userId: "c" }, "lead-edu")
    ).toEqual({ kind: "waiting", leadUserId: "lead-edu" });
    expect(
      leadApprovalStateOf({ status: "rejected", userId: "c" }, "lead-edu")
    ).toEqual({ kind: "none" });
  });

  it("reports the lead's approval or finance's reason for skipping it", () => {
    expect(
      leadApprovalStateOf(
        {
          leadApprovedAt: 5,
          leadApprovedBy: "lead-edu",
          status: "pending",
          userId: "c",
        },
        "lead-edu"
      )
    ).toEqual({ at: 5, by: "lead-edu", kind: "lead_approved" });
    expect(
      leadApprovalStateOf(
        { leadSkipReason: "Urgent", status: "approved", userId: "c" },
        "lead-edu"
      )
    ).toEqual({ kind: "skipped", reason: "Urgent" });
  });
});

describe("leadStepOutstanding", () => {
  it("holds until the lead approves or finance has a reason, at any status", () => {
    expect(leadStepOutstanding({}, "lead-edu")).toBe(true);
    expect(leadStepOutstanding({ leadApprovedAt: 5 }, "lead-edu")).toBe(false);
    expect(leadStepOutstanding({ leadSkipReason: "Urgent" }, "lead-edu")).toBe(
      false
    );
    expect(leadStepOutstanding({}, null)).toBe(false);
  });
});
