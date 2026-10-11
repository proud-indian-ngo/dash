import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api", () => ({
  getAppConfigValues: mock(),
}));

import {
  handleSocialSettingsRequest,
  type SocialSettingsDeps,
} from "./settings";
import { stubAuthorize } from "./test-helpers";

const request = () =>
  new Request("https://dash.proudindian.ngo/api/social/v1/settings");

function createDeps(
  config: Record<string, string>,
  overrides: Partial<SocialSettingsDeps> = {}
): SocialSettingsDeps {
  return {
    authorize: stubAuthorize(),
    getAppConfigValues: mock(async () => new Map(Object.entries(config))),
    ...overrides,
  };
}

describe("handleSocialSettingsRequest", () => {
  it("reads the pause keys with the events:read scope and no-store", async () => {
    const deps = createDeps({
      social_paused: "true",
      social_paused_kinds: "impact, recap,unknown,recap",
    });
    const response = await handleSocialSettingsRequest(request(), deps);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      paused: true,
      pausedKinds: ["recap", "impact"],
    });
    expect(deps.authorize).toHaveBeenCalledWith(
      expect.any(Request),
      "events:read",
      "settings"
    );
    expect(deps.getAppConfigValues).toHaveBeenCalledWith([
      "social_paused",
      "social_paused_kinds",
    ]);
  });

  it("defaults to running everything when the keys are unset or not true", async () => {
    const configs: Record<string, string>[] = [
      {},
      { social_paused: "false" },
      { social_paused: "yes" },
    ];
    for (const config of configs) {
      const response = await handleSocialSettingsRequest(
        request(),
        createDeps(config)
      );
      expect(await response.json()).toEqual({ paused: false, pausedKinds: [] });
    }
  });

  it.each([401, 403])("passes through the %i auth error", async (status) => {
    const deps = createDeps({}, { authorize: stubAuthorize(status) });
    const response = await handleSocialSettingsRequest(request(), deps);
    expect(response.status).toBe(status);
    expect(deps.getAppConfigValues).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails", async () => {
    const deps = createDeps(
      {},
      {
        getAppConfigValues: mock(async () => {
          throw new Error("db down");
        }),
      }
    );
    const response = await handleSocialSettingsRequest(request(), deps);
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
