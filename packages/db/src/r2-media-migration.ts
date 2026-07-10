import {
  buildAvatarMediaUrl,
  buildEventUpdateMediaUrl,
  parseAvatarMediaKey,
  parseAvatarMediaReferenceKey,
  parseEventUpdateMediaKey,
  parseEventUpdateMediaReferenceKey,
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
  keyPrefix: string;
  legacyCdnUrl: string;
}

interface MediaMigrationTableReport {
  changed: number;
  changedUrls: number;
  malformed: number;
  malformedIds: string[];
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
  malformedIds: [],
  scanned: 0,
  skipped: 0,
});

const parseConfiguredRawKey = (
  value: string,
  expectedPrefix: string
): string | null =>
  value.startsWith(expectedPrefix) && value.length > expectedPrefix.length
    ? value
    : null;

const parseAnyMediaReferenceKey = (
  value: string,
  legacyCdnUrl: string
): string | null =>
  parseAvatarMediaReferenceKey(value, { legacyCdnUrl }) ??
  parseEventUpdateMediaReferenceKey(value, { legacyCdnUrl });

function planRow(
  table: MediaMigrationTable,
  row: MediaMigrationRow,
  options: Pick<MediaMigrationOptions, "keyPrefix" | "legacyCdnUrl">
): { after: string; changedUrls: number; malformed: boolean } {
  const { keyPrefix, legacyCdnUrl } = options;
  if (table === "user") {
    const expectedPrefix = `${keyPrefix}/avatars/${row.id}/`;
    const rawKey = parseConfiguredRawKey(row.value, expectedPrefix);
    const managedRawKey = parseConfiguredRawKey(row.value, `${keyPrefix}/`);
    const referenceKey =
      managedRawKey ?? parseAnyMediaReferenceKey(row.value, legacyCdnUrl);
    const key =
      rawKey ??
      parseAvatarMediaKey(row.value, {
        legacyCdnUrl,
        userId: row.id,
      });
    const scopedKey = key?.startsWith(`${keyPrefix}/avatars/${row.id}/`)
      ? key
      : null;
    const after = scopedKey
      ? buildAvatarMediaUrl(row.id, scopedKey)
      : row.value;
    return {
      after,
      changedUrls: after === row.value ? 0 : 1,
      malformed: Boolean(
        referenceKey &&
          !scopedKey &&
          (referenceKey.startsWith(`${keyPrefix}/`) ||
            referenceKey.includes("/avatars/"))
      ),
    };
  }

  if (!row.eventId) {
    return { after: row.value, changedUrls: 0, malformed: true };
  }
  let hasUnscopedReference = false;
  const transformed = transformPlateImageUrls(row.value, (url) => {
    const expectedPrefix = `${keyPrefix}/updates/${row.eventId as string}/`;
    const rawKey = parseConfiguredRawKey(url, expectedPrefix);
    const managedRawKey = parseConfiguredRawKey(url, `${keyPrefix}/`);
    const referenceKey =
      managedRawKey ?? parseAnyMediaReferenceKey(url, legacyCdnUrl);
    const key =
      rawKey ??
      parseEventUpdateMediaKey(url, {
        eventId: row.eventId as string,
        legacyCdnUrl,
      });
    const scopedKey = key?.startsWith(
      `${keyPrefix}/updates/${row.eventId as string}/`
    )
      ? key
      : null;
    if (
      referenceKey &&
      !scopedKey &&
      (referenceKey.startsWith(`${keyPrefix}/`) ||
        referenceKey.includes("/updates/"))
    ) {
      hasUnscopedReference = true;
    }
    return scopedKey
      ? buildEventUpdateMediaUrl(row.eventId as string, scopedKey)
      : url;
  });
  return {
    after: transformed.content,
    changedUrls: transformed.changedCount,
    malformed: transformed.malformed || hasUnscopedReference,
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
      const planned = planRow(table, row, options);
      if (planned.malformed) {
        report.malformed += 1;
        report.malformedIds.push(row.id);
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

export function parseMediaMigrationArgs(
  args: string[],
  keyPrefix: string
): MediaMigrationOptions {
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
  if (!keyPrefix) {
    throw new Error("R2 key prefix is required");
  }
  const url = new URL(legacyCdnUrl);
  if (!(url.protocol === "https:" || url.protocol === "http:")) {
    throw new Error("--legacy-cdn-url must be an HTTP(S) URL");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("--batch-size must be an integer from 1 to 1000");
  }
  return { apply, batchSize, keyPrefix, legacyCdnUrl };
}
