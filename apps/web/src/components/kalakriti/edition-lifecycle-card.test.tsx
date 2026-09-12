import { beforeEach, describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

let complete = true;
let online = true;
let lifecycle = "registration_locked";
let blockers: { code: string; message: string }[] = [];
let registrationBlockers: { code: string; message: string }[] = [];
let readiness: any;
const actions: any[] = [];
const requests: any[] = [];
mock.module("@pi-dash/zero/kalakriti-registration-readiness", () => ({
  getKalakritiRegistrationReadiness: () => registrationBlockers,
}));
mock.module("@pi-dash/zero/kalakriti-go-live-readiness", () => ({
  getKalakritiGoLiveReadiness: (snapshot: any) => {
    readiness = snapshot;
    return blockers;
  },
}));
mock.module("@pi-dash/zero/queries", () => ({
  queries: { kalakritiEdition: { readiness: () => null } },
}));
mock.module("@pi-dash/zero/mutators", () => ({
  mutators: { kalakritiEdition: { transition: (args: any) => args } },
}));
mock.module("@rocicorp/zero/react", () => ({
  useConnectionState: () => ({ name: online ? "connected" : "disconnected" }),
  useQuery: () => [
    {
      lifecycle,
      ageCategories: [],
      centers: [
        {
          studentRegistrationEnabled: null,
          competitionEntryRegistrationEnabled: false,
        },
      ],
      competitionCategories: [],
      competitions: [],
      competitionDivisions: [],
      competitionSessions: [],
      venues: [],
      assignments: [],
      transportAssignments: [],
    },
    { type: complete ? "complete" : "unknown" },
  ],
  useZero: () => ({
    mutate: (args: any) => {
      requests.push(args);
      return { server: Promise.resolve({ type: "success" }) };
    },
  }),
}));
mock.module("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: () => undefined }),
}));
mock.module("@/hooks/use-confirm-action", () => ({
  useConfirmAction: (config: any) => {
    actions.push(config);
    return {
      isOpen: false,
      isLoading: false,
      trigger: () => undefined,
      cancel: () => undefined,
      confirm: config.onConfirm,
    };
  },
}));
mock.module("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
const { EditionLifecycleAction, EditionLifecycleAlerts } =
  await import("./edition-lifecycle-card");
const render = (canManage = true) =>
  renderToStaticMarkup(
    <EditionLifecycleAction editionId="edition" canManage={canManage} />
  );
beforeEach(() => {
  complete = true;
  online = true;
  lifecycle = "registration_locked";
  blockers = [];
  registrationBlockers = [];
  actions.length = 0;
  requests.length = 0;
});
describe("Go live UI", () => {
  it("retains shared blockers in independently named registration and go-live regions", () => {
    const message = "Every Age Category needs registration limits";
    blockers = [{ code: "limits", message }];
    registrationBlockers = [...blockers];
    const html = renderToStaticMarkup(
      <EditionLifecycleAlerts editionId="edition" canManage />
    );
    const registration = html.match(
      /<section aria-labelledby="readiness-blockers-heading">([\s\S]*?)<\/section>/
    )?.[1];
    const goLive = html.match(
      /<section aria-labelledby="go-live-blockers-heading">([\s\S]*?)<\/section>/
    )?.[1];
    expect(registration).toContain('id="readiness-blockers-heading"');
    expect(registration).toContain(
      "Complete these before reopening registration"
    );
    expect(registration).toContain(message);
    expect(goLive).toContain('id="go-live-blockers-heading"');
    expect(goLive).toContain("Complete these before going live");
    expect(goLive).toContain(message);
  });
  it("adds go-live without replacing reopen and preserves null Center flags for fail-closed readiness", async () => {
    const html = render();
    expect(html).toContain("Go live");
    expect(html).toContain("Open registration");
    expect(readiness.centers[0].studentRegistrationEnabled).toBeNull();
    expect(readiness).not.toHaveProperty("credentials");
    await actions[1].onConfirm();
    expect(requests[0]).toMatchObject({
      editionId: "edition",
      targetLifecycle: "live",
      confirmed: true,
    });
  });
  it("blocks submission with readiness blockers, partial snapshots, or disconnection", async () => {
    for (const change of [
      () => {
        blockers = [{ code: "lead", message: "Assign a lead" }];
      },
      () => {
        complete = false;
      },
      () => {
        online = false;
      },
    ]) {
      blockers = [];
      complete = true;
      online = true;
      actions.length = 0;
      change();
      render();
      expect((await actions[1].onConfirm()).type).toBe("error");
      expect(requests).toHaveLength(0);
    }
  });
  it("shows blockers and keeps go-live unavailable outside locked or without management permission", () => {
    blockers = [{ code: "lead", message: "Assign a lead" }];
    expect(
      renderToStaticMarkup(
        <EditionLifecycleAlerts editionId="edition" canManage />
      )
    ).toContain("Assign a lead");
    expect(render(false)).toBe("");
    lifecycle = "registration_open";
    expect(render()).not.toContain("Go live");
    lifecycle = "live";
    expect(render()).toBe("");
  });
});
