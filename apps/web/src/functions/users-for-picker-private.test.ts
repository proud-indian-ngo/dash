import { describe, expect, it, mock } from "bun:test";

import {
  getProgrammeLeadCandidatesWithDeps,
  getWhatsappRecipientCandidatesWithDeps,
  type PrivateUserCandidate,
} from "./users-for-picker";

const session = { user: { id: "user-1", role: "admin" } };
const candidates: PrivateUserCandidate[] = [
  { id: "candidate-1", name: "Candidate One" },
];

describe("private picker candidate reads", () => {
  it("does not query WhatsApp candidates without authorization", async () => {
    const listCandidates = mock(async () => candidates);

    await expect(
      getWhatsappRecipientCandidatesWithDeps(
        { session: null },
        {
          assertPermission: async () => {
            throw new Error("Unauthorized");
          },
          listCandidates,
        }
      )
    ).rejects.toThrow("Unauthorized");
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it("checks the permission required by each picker", async () => {
    const whatsappPermission = mock(async () => undefined);
    const financePermission = mock(async () => undefined);

    expect(
      await getWhatsappRecipientCandidatesWithDeps(
        { session },
        {
          assertPermission: whatsappPermission,
          listCandidates: async () => candidates,
        }
      )
    ).toEqual(candidates);
    expect(whatsappPermission).toHaveBeenCalledWith(
      session,
      "messages.schedule"
    );

    expect(
      await getProgrammeLeadCandidatesWithDeps(
        { session },
        {
          assertPermission: financePermission,
          listCandidates: async () => candidates,
        }
      )
    ).toEqual(candidates);
    expect(financePermission).toHaveBeenCalledWith(session, "finance.manage");
  });

  it("rechecks current permission before every candidate read", async () => {
    let authorized = true;
    const listCandidates = mock(async () => candidates);
    const deps = {
      assertPermission: async () => {
        if (!authorized) throw new Error("Forbidden");
      },
      listCandidates,
    };

    expect(await getProgrammeLeadCandidatesWithDeps({ session }, deps)).toEqual(
      candidates
    );
    authorized = false;
    await expect(
      getProgrammeLeadCandidatesWithDeps({ session }, deps)
    ).rejects.toThrow("Forbidden");
    expect(listCandidates).toHaveBeenCalledTimes(1);
  });
});
