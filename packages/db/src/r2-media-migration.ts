import {
  buildAvatarMediaUrl,
  buildEventUpdateMediaUrl,
  parseAvatarMediaKey,
  parseEventUpdateMediaKey,
  transformPlateImageUrls,
} from "@pi-dash/shared/media-url";

export type MediaMigrationTable = "eventFeedback" | "eventUpdate" | "user";

export interface MediaMigrationRow {
  eventId?: string;
  id: string;
  value: string;
}

export interface MediaMigrationChange {
  after: string;
  before: string;
  id: string;
}

export interface MediaMigrationRepository {
  applyBatch: (
    table: MediaMigrationTable,
    changes: MediaMigrationChange[]
  ) => Promise<void>;
  readBatch: (
    table: MediaMigrationTable,
    afterId: null | string,
    limit: number
  ) => Promise<MediaMigrationRow[]>;
}

export interface MediaMigrationOptions {
  apply: boolean;
  batchSize: number;
  legacyCdnUrl: string;
}

interface MediaMigrationTableReport {
  changed: number;
  changedUrls: number;
  malformed: number;
  scanned: number;
  skipped: number;
}

export interface MediaMigrationReport {
  apply: boolean;
  tables: Record<MediaMigrationTable, MediaMigrationTableReport>;
  totals: { changed: number; malformed: number; skipped: number };
}

const TABLES = ["user", "eventUpdate", "eventFeedback"] as const;

const emptyReport = (): MediaMigrationTableReport => ({
  changed: 0,
  changedUrls: 0,
  malformed: 0,
  scanned: 0,
  skipped: 0,
});

function planRow(
  table: MediaMigrationTable,
  row: MediaMigrationRow,
  legacyCdnUrl: string
): { after: string; changedUrls: number; malformed: boolean } {
  if (table === "user") {
    const key = parseAvatarMediaKey(row.value, {
      legacyCdnUrl,
      userId: row.id,
    });
    const after = key ? buildAvatarMediaUrl(row.id, key) : row.value;
    return {
      after,
      changedUrls: after === row.value ? 0 : 1,
      malformed: false,
    };
  }

  if (!row.eventId) {
    return { after: row.value, changedUrls: 0, malformed: true };
  }
  const transformed = transformPlateImageUrls(row.value, (url) => {
    const key = parseEventUpdateMediaKey(url, {
      eventId: row.eventId as string,
      legacyCdnUrl,
    });
    return key ? buildEventUpdateMediaUrl(row.eventId as string, key) : url;
  });
  return {
    after: transformed.content,
    changedUrls: transformed.changedCount,
    malformed: transformed.malformed,
  };
}

async function migrateTable(
  repository: MediaMigrationRepository,
  table: MediaMigrationTable,
  options: MediaMigrationOptions
): Promise<MediaMigrationTableReport> {
  const report = emptyReport();
  let cursor: null | string = null;
  let rows: MediaMigrationRow[];

  do {
    // biome-ignore lint/performance/noAwaitInLoops: cursor pagination must read the previous batch first.
    rows = await repository.readBatch(table, cursor, options.batchSize);
    if (rows.length === 0) {
      break;
    }
    const changes: MediaMigrationChange[] = [];
    for (const row of rows) {
      report.scanned += 1;
      const planned = planRow(table, row, options.legacyCdnUrl);
      if (planned.malformed) {
        report.malformed += 1;
        continue;
      }
      if (planned.after === row.value) {
        report.skipped += 1;
        continue;
      }
      report.changed += 1;
      report.changedUrls += planned.changedUrls;
      changes.push({ after: planned.after, before: row.value, id: row.id });
    }
    if (options.apply && changes.length > 0) {
      await repository.applyBatch(table, changes);
    }
    cursor = rows.at(-1)?.id ?? null;
  } while (rows.length === options.batchSize);

  return report;
}

export async function runR2MediaUrlMigration(
  repository: MediaMigrationRepository,
  options: MediaMigrationOptions
): Promise<MediaMigrationReport> {
  const [userReport, eventUpdateReport, eventFeedbackReport] =
    await Promise.all([
      migrateTable(repository, "user", options),
      migrateTable(repository, "eventUpdate", options),
      migrateTable(repository, "eventFeedback", options),
    ]);
  const tables = {
    eventFeedback: eventFeedbackReport,
    eventUpdate: eventUpdateReport,
    user: userReport,
  };
  return {
    apply: options.apply,
    tables,
    totals: {
      changed: TABLES.reduce((sum, table) => sum + tables[table].changed, 0),
      malformed: TABLES.reduce(
        (sum, table) => sum + tables[table].malformed,
        0
      ),
      skipped: TABLES.reduce((sum, table) => sum + tables[table].skipped, 0),
    },
  };
}

export function parseMediaMigrationArgs(args: string[]): MediaMigrationOptions {
  let apply = false;
  let batchSize = 100;
  let legacyCdnUrl: string | undefined;
  for (const arg of args) {
    if (arg === "--apply") {
      apply = true;
    } else if (arg.startsWith("--legacy-cdn-url=")) {
      legacyCdnUrl = arg.slice("--legacy-cdn-url=".length);
    } else if (arg.startsWith("--batch-size=")) {
      batchSize = Number(arg.slice("--batch-size=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!legacyCdnUrl) {
    throw new Error("--legacy-cdn-url is required");
  }
  const url = new URL(legacyCdnUrl);
  if (!(url.protocol === "https:" || url.protocol === "http:")) {
    throw new Error("--legacy-cdn-url must be an HTTP(S) URL");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("--batch-size must be an integer from 1 to 1000");
  }
  return { apply, batchSize, legacyCdnUrl };
}
