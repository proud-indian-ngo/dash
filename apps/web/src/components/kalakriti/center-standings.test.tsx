import { describe, expect, it, mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { KalakritiStandings } from "@/functions/kalakriti-results";

let snapshot: KalakritiStandings;
mock.module("./use-result-snapshot", () => ({
  useResultSnapshot: () => ({
    data: snapshot,
    fresh: true,
    error: false,
    refresh: async () => undefined,
  }),
}));
mock.module("@rocicorp/zero/react", () => ({ useZero: () => ({}) }));
mock.module("@/hooks/use-confirm-action", () => ({
  useConfirmAction: () => ({
    trigger: () => undefined,
    confirm: () => undefined,
    cancel: () => undefined,
    isLoading: false,
    isOpen: false,
  }),
}));

const { CenterStandings } = await import("./center-standings");

const centers = [
  { id: "a", name: "Center A", points: 50, wins: 4, runnerUps: 2, rank: 1 },
  { id: "b", name: "Center B", points: 35, wins: 2, runnerUps: 3, rank: 2 },
];

function textContent() {
  return renderToStaticMarkup(<CenterStandings year={2026} />)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

describe("CenterStandings", () => {
  it("does not name a leader before any result is published", () => {
    snapshot = {
      editionId: "edition",
      version: 0,
      canFinalize: false,
      canWrite: false,
      finalizedAt: null,
      winnerCenterId: null,
      runnerUpCenterId: null,
      winnerPoints: 10,
      runnerUpPoints: 5,
      publishedCount: 0,
      totalCount: 2,
      centers: centers.map((center) => ({
        ...center,
        points: 0,
        wins: 0,
        runnerUps: 0,
        rank: 1,
      })),
    };
    expect(textContent()).toContain(
      "The lead will appear after the first result is published."
    );
  });

  it("shows final Center totals instead of per-award point weights", () => {
    snapshot = {
      editionId: "edition",
      version: 2,
      canFinalize: false,
      canWrite: false,
      finalizedAt: 1,
      winnerCenterId: "a",
      runnerUpCenterId: "b",
      winnerPoints: 10,
      runnerUpPoints: 5,
      publishedCount: 2,
      totalCount: 2,
      centers,
    };
    const output = textContent();
    expect(output).toContain("Overall winner: Center A · 50 points");
    expect(output).toContain("Overall runner-up: Center B · 35 points");
  });
});
