import { describe, expect, it } from "vitest";

import { parseKalakritiPersonQr } from "./kalakriti-person-qr";

const id = "01950000-0000-7000-8000-000000000001";

describe("person QR parsing", () => {
  it.each(["student", "guardian", "volunteer", "guest", "judge"])(
    "accepts %s database identifiers",
    (type) => {
      expect(parseKalakritiPersonQr(JSON.stringify({ id, type }))).toEqual({
        id,
        type,
      });
    }
  );
  it.each([
    "",
    "not JSON",
    "null",
    "[]",
    '"text"',
    "{}",
    " ".repeat(257),
    JSON.stringify({ id, type: "admin" }),
    JSON.stringify({ id, type: "attendee" }),
    JSON.stringify({ id, type: "guest", phone: "private" }),
    JSON.stringify({ id: "KALJ-2027-0001", type: "judge" }),
    JSON.stringify({ id: "KAL-2027-0001", type: "student" }),
    JSON.stringify({ id: 123, type: "student" }),
    JSON.stringify({ id, type: "student", editionId: "extra" }),
    JSON.stringify({ id }),
  ])("rejects malformed or overlong QR %s", (value) => {
    expect(() => parseKalakritiPersonQr(value)).toThrow("Invalid person QR");
  });
});
