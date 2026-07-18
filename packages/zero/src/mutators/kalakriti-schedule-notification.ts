import type { Context } from "../context";
import { zql } from "../schema";
import type { LockableKalakritiTx } from "./kalakriti-row-locks";

interface ScheduleImpact {
  centerIds: string[];
  competitionIds: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

async function getImpact(
  tx: LockableKalakritiTx,
  sessionsQuery: unknown,
  entriesQuery: unknown
): Promise<ScheduleImpact> {
  const [sessions, entries] = (await Promise.all([
    tx.run(sessionsQuery),
    tx.run(entriesQuery),
  ])) as [{ competitionId: string }[], { centerId: string }[]];
  return {
    centerIds: unique(entries.map(({ centerId }) => centerId)),
    competitionIds: unique(sessions.map(({ competitionId }) => competitionId)),
  };
}

export function getAgeCategoryScheduleImpact(
  tx: LockableKalakritiTx,
  ageCategoryId: string
): Promise<ScheduleImpact> {
  return getImpact(
    tx,
    zql.kalakritiCompetitionSession.where("ageCategoryId", ageCategoryId),
    zql.kalakritiCompetitionEntry.whereExists("session", (session) =>
      session.where("ageCategoryId", ageCategoryId)
    )
  );
}

export async function getCompetitionScheduleImpact(
  tx: LockableKalakritiTx,
  competitionId: string
): Promise<ScheduleImpact> {
  const entries = (await tx.run(
    zql.kalakritiCompetitionEntry.whereExists("session", (session) =>
      session.where("competitionId", competitionId)
    )
  )) as { centerId: string }[];
  return {
    centerIds: unique(entries.map(({ centerId }) => centerId)),
    competitionIds: [competitionId],
  };
}

export async function getSessionScheduleImpact(
  tx: LockableKalakritiTx,
  sessionId: string,
  competitionId: string
): Promise<ScheduleImpact> {
  const entries = (await tx.run(
    zql.kalakritiCompetitionEntry.where("sessionId", sessionId)
  )) as { centerId: string }[];
  return {
    centerIds: unique(entries.map(({ centerId }) => centerId)),
    competitionIds: [competitionId],
  };
}

export function getVenueScheduleImpact(
  tx: LockableKalakritiTx,
  venueId: string
): Promise<ScheduleImpact> {
  return getImpact(
    tx,
    zql.kalakritiCompetitionSession.where("venueId", venueId),
    zql.kalakritiCompetitionEntry.whereExists("session", (session) =>
      session.where("venueId", venueId)
    )
  );
}

export function pushKalakritiScheduleChangedTask(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  impact: ScheduleImpact & {
    editionId: string;
    revision: string;
  }
) {
  if (tx.location !== "server") {
    return;
  }
  const centerIds = unique(impact.centerIds);
  const competitionIds = unique(impact.competitionIds);
  ctx?.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      await enqueue(
        "notify-kalakriti-schedule-changed",
        {
          centerIds,
          competitionIds,
          editionId: impact.editionId,
          revision: impact.revision,
        },
        {
          singletonKey: `kalakriti-schedule-${impact.editionId}-${impact.revision}`,
          traceId: ctx.traceId,
        }
      );
    },
    meta: {
      centerIds,
      competitionIds,
      editionId: impact.editionId,
      mutator: "changeKalakritiSchedule",
      revision: impact.revision,
    },
  });
}
