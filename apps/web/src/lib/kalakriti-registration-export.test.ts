import { describe, expect, it } from "vitest";
import { buildCsv, createCsvDownload } from "@/lib/csv-export";
import {
  buildKalakritiRegistrationCsvFiles,
  kalakritiRegistrationExportInputSchema,
} from "@/lib/kalakriti-registration-export";

describe("Kalakriti registration CSV exports", () => {
  it("accepts only an Edition year from the browser", () => {
    expect(
      kalakritiRegistrationExportInputSchema.safeParse({ year: 2027 }).success
    ).toBe(true);
    expect(
      kalakritiRegistrationExportInputSchema.safeParse({
        centerId: "center-2",
        year: 2027,
      }).success
    ).toBe(false);
  });

  it("builds an allowlisted two-file registration archive", async () => {
    const files = buildKalakritiRegistrationCsvFiles(2027, {
      entries: [
        {
          ageCategory: "Junior",
          center: "Jayanagar",
          competition: "Drawing",
          competitionCategory: "Art",
          endAt: "2027-11-21T05:00:00.000Z",
          entryId: "entry-1",
          participantIds: ["K27-001"],
          participantNames: ['=HYPERLINK("https://invalid")'],
          participationMode: "individual",
          startAt: "2027-11-21T04:00:00.000Z",
          venue: "Hall A",
        },
      ],
      students: [
        {
          ageCategory: "Junior",
          center: "Jayanagar",
          dateOfBirth: "2016-04-03",
          gender: "female",
          name: "=1+1",
          studentId: "K27-001",
        },
      ],
    });

    expect(files).toHaveLength(2);
    const [studentsFile, entriesFile] = files;
    if (!(studentsFile && entriesFile)) {
      throw new Error("Expected Student and Competition Entry files");
    }
    expect(studentsFile.headers).not.toContain("Created By");
    expect(studentsFile.headers).not.toContain("Credential");
    expect(buildCsv(studentsFile.headers, studentsFile.rows)).toContain(
      "'=1+1"
    );
    expect(buildCsv(entriesFile.headers, entriesFile.rows)).toContain(
      '"\'=HYPERLINK(""https://invalid"")"'
    );

    const artifact = createCsvDownload(
      files,
      "kalakriti-2027-registration.zip"
    );
    expect(artifact.filename).toBe("kalakriti-2027-registration.zip");
    expect(artifact.blob.type).toBe("application/zip");
    expect((await artifact.blob.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
