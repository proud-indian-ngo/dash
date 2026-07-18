// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/db/queries/kalakriti-public-schedule", () => ({
  getKalakritiPublicSchedule: vi.fn(),
}));

import {
  handlePublicScheduleRequest,
  type PublicScheduleHandlerDeps,
} from "./schedule";

const publicSchedule = {
  edition: {
    eventDate: "2027-01-24",
    id: "private-edition-id",
    lifecycle: "registration_open",
    name: "Kalakriti 2027",
    plannedRegistrationCloseAt: 1_800_000_000_000,
    timezone: "Asia/Kolkata",
    year: 2027,
  },
  sessions: [
    {
      ageCategory: "Juniors",
      capacity: 25,
      competition: "Drawing",
      endAt: 1_800_001_800_000,
      internalNotes: "Private note",
      judgeNames: ["Private judge"],
      startAt: 1_800_000_000_000,
      status: "scheduled",
      studentNames: ["Private student"],
      venue: "Art room",
    },
  ],
};

const deps = (
  getSchedule: PublicScheduleHandlerDeps["getSchedule"]
): PublicScheduleHandlerDeps => ({ getSchedule });

describe("handlePublicScheduleRequest", () => {
  it("returns the public allowlist without requiring a session", async () => {
    const getSchedule = vi.fn(async () => publicSchedule);

    const response = await handlePublicScheduleRequest(
      "2027",
      deps(getSchedule)
    );

    expect(getSchedule).toHaveBeenCalledWith(2027);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate"
    );
    await expect(response.json()).resolves.toEqual({
      edition: {
        eventDate: "2027-01-24",
        name: "Kalakriti 2027",
        timezone: "Asia/Kolkata",
        year: 2027,
      },
      sessions: [
        {
          ageCategory: "Juniors",
          competition: "Drawing",
          endAt: 1_800_001_800_000,
          startAt: 1_800_000_000_000,
          status: "scheduled",
          venue: "Art room",
        },
      ],
    });
  });

  it("does not serialize private schedule data", async () => {
    const response = await handlePublicScheduleRequest(
      "2027",
      deps(async () => publicSchedule)
    );
    const body = await response.text();

    for (const privateValue of [
      "private-edition-id",
      "registration_open",
      "Private note",
      "Private judge",
      "Private student",
      "capacity",
      "plannedRegistrationCloseAt",
    ]) {
      expect(body).not.toContain(privateValue);
    }
  });

  it("returns a safe not-found response for an unknown edition", async () => {
    const response = await handlePublicScheduleRequest(
      "2028",
      deps(async () => null)
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Schedule not found",
    });
  });

  it("rejects a malformed year before reading the schedule", async () => {
    const getSchedule = vi.fn(async () => null);
    const response = await handlePublicScheduleRequest(
      "twenty-seven",
      deps(getSchedule)
    );

    expect(response.status).toBe(400);
    expect(getSchedule).not.toHaveBeenCalled();
  });
});
