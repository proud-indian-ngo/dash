import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/env/server", () => ({
  env: {
    APP_URL: "https://dash.test",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-32",
  },
}));

import { TOPICS } from "./topics";
import {
  buildUnsubscribeLinks,
  getUnsubscribableTopic,
  verifyUnsubscribeSignature,
} from "./unsubscribe";

function sigOf(url: string): string {
  return new URL(url).searchParams.get("sig") ?? "";
}

describe("unsubscribe links", () => {
  it("signs a page link and a one-click link for an optional topic", () => {
    const links = buildUnsubscribeLinks("user-1", TOPICS.TEAMS);

    expect(links?.pageUrl).toMatch(/^https:\/\/dash\.test\/unsubscribe\?/);
    expect(links?.oneClickUrl).toMatch(
      /^https:\/\/dash\.test\/api\/email\/unsubscribe\?/
    );
    const params = new URL(links?.pageUrl ?? "").searchParams;
    expect(params.get("u")).toBe("user-1");
    expect(params.get("t")).toBe(TOPICS.TEAMS);
    expect(
      verifyUnsubscribeSignature(
        "user-1",
        TOPICS.TEAMS,
        params.get("sig") ?? ""
      )
    ).toBe(true);
  });

  it("gives required and email-less topics no link", () => {
    expect(buildUnsubscribeLinks("user-1", TOPICS.ACCOUNT)).toBeNull();
    expect(
      buildUnsubscribeLinks("user-1", TOPICS.KALAKRITI_REGISTRATION)
    ).toBeNull();
    expect(getUnsubscribableTopic("Not a topic")).toBeNull();
  });

  it("rejects a signature for another user or topic", () => {
    const sig = sigOf(
      buildUnsubscribeLinks("user-1", TOPICS.TEAMS)?.oneClickUrl ?? ""
    );

    expect(verifyUnsubscribeSignature("user-2", TOPICS.TEAMS, sig)).toBe(false);
    expect(
      verifyUnsubscribeSignature("user-1", TOPICS.EVENTS_PHOTOS, sig)
    ).toBe(false);
  });

  it("rejects malformed signatures", () => {
    expect(verifyUnsubscribeSignature("user-1", TOPICS.TEAMS, "")).toBe(false);
    expect(verifyUnsubscribeSignature("user-1", TOPICS.TEAMS, "zz")).toBe(
      false
    );
  });
});
