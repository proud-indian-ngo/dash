import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const AUDITED_SERVER_FUNCTIONS = [
  "createRole",
  "createUserAdmin",
  "deleteProfilePicture",
  "deleteRole",
  "deleteTemporaryUpload",
  "deleteUserAdmin",
  "postEventRsvpPoll",
  "setUserBanAdmin",
  "setUserPasswordAdmin",
  "triggerR2Cleanup",
  "triggerWhatsAppGroupScan",
  "updateRole",
  "updateUserAdmin",
  "uploadPhotoToImmich",
];

const EXEMPT_SERVER_FUNCTIONS = [
  "exportCsvData",
  "exportVendorPaymentsCsv",
  "getEventEditorUploadUrl",
  "getEventPhotoUploadUrl",
  "getProfilePictureUploadUrl",
  "getRequestUploadUrl",
  "getScheduledMessageUploadUrl",
];

const CLASSIFIED_API_POST_FILES = [
  "routes/api/auth/$.ts",
  "routes/api/jobs/$id/cancel.ts",
  "routes/api/jobs/$id/retry.ts",
  "routes/api/jobs/index.ts",
  "routes/api/log/ingest.ts",
  "routes/api/whatsapp/webhook.ts",
  "routes/api/zero/mutate.ts",
  "routes/api/zero/query.ts",
];
const AUDITED_API_MARKERS: Record<string, string[]> = {
  "routes/api/auth/$.ts": [
    "runSessionAuditedAction",
    "getAuditedAuthAction",
    "getAuditedAuthChangedFields",
  ],
  "routes/api/jobs/$id/cancel.ts": ["runSessionAuditedAction"],
  "routes/api/jobs/$id/retry.ts": ["runSessionAuditedAction"],
  "routes/api/jobs/index.ts": ["runSessionAuditedAction"],
  "routes/api/zero/mutate.ts": [
    "runZeroAuditedMutation",
    "tx.mutate.auditLog.insert",
  ],
};
const POST_API_ROUTE_PATTERN = /\bPOST:\s*(async\s*)?\(/;
const POST_SERVER_FUNCTION_PATTERN =
  /export const (\w+) = createServerFn\(\{ method: "POST" \}\)/g;
const compareStrings = (left: string, right: string) =>
  left.localeCompare(right);

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("audit entrypoint coverage", () => {
  it("classifies every POST server function", () => {
    const directory = join(import.meta.dirname, "../functions");
    const discovered = listTypeScriptFiles(directory).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return Array.from(
        source.matchAll(POST_SERVER_FUNCTION_PATTERN),
        (match) => match[1]
      ).filter((name): name is string => name !== undefined);
    });

    expect(discovered.sort(compareStrings)).toEqual(
      [...AUDITED_SERVER_FUNCTIONS, ...EXEMPT_SERVER_FUNCTIONS].sort(
        compareStrings
      )
    );
  });

  it("keeps every audited server function inside the shared runner", () => {
    const directory = join(import.meta.dirname, "../functions");
    const audited = new Set(AUDITED_SERVER_FUNCTIONS);
    const discovered = new Set<string>();

    for (const path of listTypeScriptFiles(directory)) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(POST_SERVER_FUNCTION_PATTERN)) {
        const [, name] = match;
        if (!(name && audited.has(name))) {
          continue;
        }
        const start = match.index;
        const nextExport = source.indexOf("\nexport const ", start + 1);
        const block = source.slice(
          start,
          nextExport === -1 ? undefined : nextExport
        );
        expect(block).toContain("runSessionAuditedAction");
        discovered.add(name);
      }
    }

    expect([...discovered].sort(compareStrings)).toEqual(
      [...AUDITED_SERVER_FUNCTIONS].sort(compareStrings)
    );
  });

  it("classifies every POST API route", () => {
    const srcDirectory = join(import.meta.dirname, "..");
    const directory = join(srcDirectory, "routes/api");
    const discovered = listTypeScriptFiles(directory)
      .filter((path) => !path.endsWith(".test.ts"))
      .filter((path) => POST_API_ROUTE_PATTERN.test(readFileSync(path, "utf8")))
      .map((path) => relative(srcDirectory, path));

    expect(discovered.sort(compareStrings)).toEqual(
      [...CLASSIFIED_API_POST_FILES].sort(compareStrings)
    );
  });

  it("keeps selected authenticated API routes inside audit boundaries", () => {
    const srcDirectory = join(import.meta.dirname, "..");
    for (const [relativePath, markers] of Object.entries(AUDITED_API_MARKERS)) {
      const source = readFileSync(join(srcDirectory, relativePath), "utf8");
      for (const marker of markers) {
        expect(source).toContain(marker);
      }
    }
  });
});
