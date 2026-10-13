import { describe, expect, it } from "bun:test";

import { resolveSaveMode } from "@pi-dash/db/party-save-rules";

import { isSaveConflict } from "./save-conflict";

const savedAt = new Date("2026-10-13T06:00:00Z");

function staleSaveError(): unknown {
  try {
    resolveSaveMode(
      {
        actorId: "user-1",
        expectedPartyUpdatedAt: savedAt.getTime() - 1000,
        expectedUpdatedAt: null,
        mode: "update",
      },
      { createdAt: savedAt, createdBy: "user-1", updatedAt: savedAt },
      null
    );
  } catch (error) {
    return error;
  }
  throw new Error("Expected a stale save to throw");
}

describe("isSaveConflict", () => {
  it("recognises the conflict a stale party save throws", () => {
    expect(isSaveConflict(staleSaveError())).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isSaveConflict(new Error("Party not found"))).toBe(false);
    expect(isSaveConflict("Someone else changed this donor")).toBe(false);
  });
});
