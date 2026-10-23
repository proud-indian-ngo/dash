import { beforeEach, describe, expect, it, mock } from "bun:test";

let allowed = false;
let configured = false;
let configChecks = 0;
let listCalls = 0;
let permissionChecks: string[] = [];
let access: unknown = { backPath: null, status: "not_found" };
let inviteLink: string | null = null;
let inviteLinkError: Error | null = null;
let inviteLinkCalls: string[] = [];

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerPermission: async (_session: unknown, permission: string) => {
    permissionChecks.push(permission);
    if (!allowed) {
      throw new Error("Forbidden");
    }
  },
}));
mock.module("@/lib/whatsapp-group-access", () => ({
  resolveWhatsAppGroupAccess: async () => access,
}));
mock.module("@pi-dash/whatsapp/groups", () => ({
  getWhatsAppGroupInviteLink: async (jid: string) => {
    inviteLinkCalls.push(jid);
    if (inviteLinkError) {
      throw inviteLinkError;
    }
    return inviteLink;
  },
  isWhatsAppConfigured: () => {
    configChecks++;
    return configured;
  },
  listJoinedGroups: async () => {
    listCalls++;
    return [];
  },
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      handler: (handler: unknown) => handler,
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));

const { checkWhatsAppConfiguration, getWhatsAppGroupJoinLink } =
  await import("./whatsapp-groups");
const session = { user: { id: "actor", role: "admin" } };
const runCheck = () =>
  (
    checkWhatsAppConfiguration as unknown as (
      input: unknown
    ) => Promise<unknown>
  )({ context: { session } });

describe("WhatsApp configuration check", () => {
  beforeEach(() => {
    allowed = false;
    configured = false;
    configChecks = 0;
    listCalls = 0;
    permissionChecks = [];
  });

  it("enforces settings permission before reading configuration", async () => {
    await expect(runCheck()).rejects.toThrow("Forbidden");
    expect(permissionChecks).toEqual(["settings.whatsapp_groups"]);
    expect(configChecks).toBe(0);
    expect(listCalls).toBe(0);
  });
});

const GROUP_ID = "0199e3a0-0000-7000-8000-000000000001";
const runJoin = () =>
  (getWhatsAppGroupJoinLink as unknown as (input: unknown) => Promise<unknown>)(
    { context: { session }, data: { groupId: GROUP_ID } }
  );

describe("WhatsApp group join link", () => {
  beforeEach(() => {
    access = { backPath: null, status: "not_found" };
    inviteLink = null;
    inviteLinkError = null;
    inviteLinkCalls = [];
  });

  it("returns the invite link to a current member", async () => {
    access = {
      backPath: "/teams/team-1",
      jid: "120363@g.us",
      name: "Spoken English",
      status: "allowed",
    };
    inviteLink = "https://chat.whatsapp.com/abc";
    expect(await runJoin()).toEqual({
      backPath: "/teams/team-1",
      name: "Spoken English",
      reason: null,
      url: "https://chat.whatsapp.com/abc",
    });
    expect(inviteLinkCalls).toEqual(["120363@g.us"]);
  });

  it("withholds the link and group name from someone no longer a member", async () => {
    access = { backPath: "/teams/team-1", status: "not_member" };
    expect(await runJoin()).toEqual({
      backPath: "/teams/team-1",
      name: null,
      reason: "not_member",
      url: null,
    });
    expect(inviteLinkCalls).toEqual([]);
  });

  it("reports a group that no longer exists", async () => {
    expect(await runJoin()).toEqual({
      backPath: null,
      name: null,
      reason: "not_found",
      url: null,
    });
  });

  it("reports the link as unavailable when WhatsApp can't provide it", async () => {
    access = {
      backPath: null,
      jid: "120363@g.us",
      name: "All volunteers",
      status: "allowed",
    };
    inviteLinkError = new Error("GoWA down");
    expect(await runJoin()).toEqual({
      backPath: null,
      name: "All volunteers",
      reason: "unavailable",
      url: null,
    });
  });
});
