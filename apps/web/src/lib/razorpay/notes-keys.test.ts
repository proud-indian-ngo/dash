import { describe, expect, it } from "bun:test";

import {
  DEFAULT_NOTES_KEYS,
  notesKey,
  parseNotesKeys,
  splitNotesKeys,
} from "./notes-keys";

describe("notes keys", () => {
  it("falls back to the defaults for a missing or unreadable setting", () => {
    expect(parseNotesKeys(null)).toEqual(DEFAULT_NOTES_KEYS);
    expect(parseNotesKeys("{not json")).toEqual(DEFAULT_NOTES_KEYS);
    expect(parseNotesKeys(JSON.stringify({ name: ["x"] }))).toEqual(
      DEFAULT_NOTES_KEYS
    );
  });

  it("reads a stored setting", () => {
    const stored = { ...DEFAULT_NOTES_KEYS, name: ["donor"] };
    expect(parseNotesKeys(JSON.stringify(stored))).toEqual(stored);
  });

  it("splits a typed list, dropping blanks and repeats", () => {
    expect(splitNotesKeys(" name, Full Name ,, full_name, pan ")).toEqual([
      "name",
      "Full Name",
      "pan",
    ]);
    expect(notesKey("PAN-Number")).toBe("pannumber");
  });
});
