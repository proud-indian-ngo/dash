import { describe, expect, it } from "bun:test";

import { decodeEncodedWords, readEmailEvidence } from "./eml";

const encoder = new TextEncoder();

const RESIGNATION = [
  "DKIM-Signature: v=1; a=rsa-sha256; d=gmail.com; s=20230601;",
  "\th=from:to:subject; bh=abc=; b=def=",
  "From: Sameedha Salvi <sameedha@example.com>",
  "To: Somasundaram Ayyappan <somu@proudindian.ngo>",
  "Subject: =?UTF-8?Q?Resignation_from_the_Board_=E2=80=94_Proud_Indian?=",
  "Date: Fri, 16 Oct 2026 10:12:00 +0530",
  "Message-ID: <CAF123@mail.gmail.com>",
  'Content-Type: multipart/mixed; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain",
  "",
  "I resign as trustee with effect from today.",
  "--b1",
  "Content-Type: application/pdf",
  "Content-Disposition: attachment;",
  ' filename="resignation-letter.pdf"',
  "",
  "JVBERi0xLjQK",
  "--b1--",
].join("\r\n");

describe("readEmailEvidence", () => {
  it("keeps the envelope facts and attachment names, not the body", () => {
    const evidence = readEmailEvidence(encoder.encode(RESIGNATION));
    expect(evidence).toEqual({
      attachments: ["resignation-letter.pdf"],
      date: "Fri, 16 Oct 2026 10:12:00 +0530",
      dkimSigned: true,
      from: "Sameedha Salvi <sameedha@example.com>",
      messageId: "<CAF123@mail.gmail.com>",
      subject: "Resignation from the Board — Proud Indian",
      to: "Somasundaram Ayyappan <somu@proudindian.ngo>",
    });
    expect(JSON.stringify(evidence)).not.toContain("with effect from today");
  });

  it("reports no DKIM signature when there is none", () => {
    const evidence = readEmailEvidence(
      encoder.encode("From: a@b.c\nDate: Mon, 1 Jan 2024 00:00:00 +0000\n\nhi")
    );
    expect(evidence?.dkimSigned).toBe(false);
    expect(evidence?.attachments).toEqual([]);
  });

  it("returns null for something that isn't an email", () => {
    expect(readEmailEvidence(encoder.encode("%PDF-1.7\n..."))).toBeNull();
  });
});

describe("decodeEncodedWords", () => {
  it("decodes base64 words and joins adjacent ones", () => {
    const b64 = Buffer.from("Trust deed", "utf8").toString("base64");
    expect(decodeEncodedWords(`=?UTF-8?B?${b64}?= =?UTF-8?Q?_v2?=`)).toBe(
      "Trust deed v2"
    );
  });
});
