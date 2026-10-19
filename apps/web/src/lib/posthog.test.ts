import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_ENV: "production", VITE_APP_RELEASE: "abc123" },
}));

import { routeIdToTemplate, scrubEvent } from "./posthog";

describe("routeIdToTemplate", () => {
  it("drops pathless layouts and keeps params as placeholders", () => {
    expect(routeIdToTemplate("/_app/teams/$id")).toBe("/teams/$id");
    expect(routeIdToTemplate("/_app/settings/_layout/roles/")).toBe(
      "/settings/roles"
    );
    expect(routeIdToTemplate("/_auth/login")).toBe("/login");
    expect(routeIdToTemplate("/_app/")).toBe("/");
  });
});

describe("scrubEvent", () => {
  const event = {
    $set: { $current_url: "https://dash.test/teams/42?tab=x", role: "admin" },
    $set_once: {
      $initial_current_url: "https://dash.test/teams/42",
      $initial_referrer: "https://mail.test/",
    },
    event: "$pageview",
    properties: {
      $current_url: "https://dash.test/teams/42?tab=x",
      $ip: "203.0.113.7",
      $pathname: "/teams/42",
      $referrer: "https://mail.test/",
      $referring_domain: "mail.test",
      $session_entry_url: "https://dash.test/teams/42",
      ip: "203.0.113.7",
      route_template: "/teams/$id",
      token: "phc_test",
    },
    uuid: "1",
  };

  it("replaces raw URLs with the route template and strips IPs and referrers", () => {
    const scrubbed = scrubEvent(event, "/teams/$id");

    expect(scrubbed.properties).toEqual({
      $current_url: "/teams/$id",
      $geoip_disable: true,
      $pathname: "/teams/$id",
      environment: "production",
      release: "abc123",
      route_template: "/teams/$id",
      token: "phc_test",
    });
    expect(scrubbed.$set).toEqual({ role: "admin" });
    expect(scrubbed.$set_once).toEqual({});
  });

  it("drops the URL entirely before the first pageview", () => {
    const scrubbed = scrubEvent(event, undefined);

    expect(scrubbed.properties.$current_url).toBeUndefined();
    expect(scrubbed.properties.$pathname).toBeUndefined();
  });

  it("strips query strings from exception frames", () => {
    const scrubbed = scrubEvent(
      {
        event: "$exception",
        properties: {
          $exception_list: [
            {
              stacktrace: {
                frames: [
                  {
                    abs_path: "https://dash.test/assets/app.js?v=1#x",
                    filename: "https://dash.test/assets/app.js?v=1",
                    lineno: 3,
                  },
                ],
              },
              type: "TypeError",
            },
          ],
        },
        uuid: "2",
      },
      "/teams/$id"
    );

    expect(scrubbed.properties.$exception_list).toEqual([
      {
        stacktrace: {
          frames: [
            {
              abs_path: "https://dash.test/assets/app.js",
              filename: "https://dash.test/assets/app.js",
              lineno: 3,
            },
          ],
        },
        type: "TypeError",
      },
    ]);
  });
});
