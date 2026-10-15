import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { WhatsAppGroupJoinLink } from "@/functions/whatsapp-groups";

let link: WhatsAppGroupJoinLink;
const getWhatsAppGroupJoinLink = mock(async () => link);

mock.module("@/functions/whatsapp-groups", () => ({
  getWhatsAppGroupJoinLink,
}));

import { Route } from "@/routes/_app/whatsapp-groups/$groupId.join";

const GROUP_ID = "0199e3a0-0000-7000-8000-000000000001";

function runBeforeLoad() {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Join route beforeLoad is missing");
  }
  return beforeLoad({
    params: { groupId: GROUP_ID },
  } as unknown as Parameters<typeof beforeLoad>[0]);
}

describe("WhatsApp group join route", () => {
  beforeEach(() => {
    getWhatsAppGroupJoinLink.mockClear();
  });

  it("redirects to the invite link", async () => {
    link = {
      backPath: "/teams/team-1",
      name: "Spoken English",
      reason: null,
      url: "https://chat.whatsapp.com/abc",
    };
    const thrown = await Promise.resolve(runBeforeLoad()).catch(
      (error: unknown) => error
    );
    expect(getWhatsAppGroupJoinLink).toHaveBeenCalledWith({
      data: { groupId: GROUP_ID },
    });
    expect(thrown).toMatchObject({
      options: { href: "https://chat.whatsapp.com/abc" },
    });
  });

  it("returns why there is no link", async () => {
    link = {
      backPath: "/events/event-1",
      name: null,
      reason: "not_member",
      url: null,
    };
    expect(await runBeforeLoad()).toEqual({
      joinFailure: {
        backPath: "/events/event-1",
        name: null,
        reason: "not_member",
        url: null,
      },
    });
  });
});
