import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const current = new Uint8Array([1, 2, 3, 4]);
const signedFile = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

const state = {
  certificate: null as Record<string, unknown> | null,
  declaration: null as Record<string, unknown> | null,
  doc: { closedAt: null as Date | null, documentId: "DOC1", id: "e1" },
  meeting: null as Record<string, unknown> | null,
  acceptError: null as Error | null,
  getMeetingAfter: null as Record<string, unknown> | null,
  taken: null as {
    added: { end: number; signedAt: string; trusteeId: string }[];
    file: Uint8Array;
    report: unknown;
  } | null,
};
const calls = {
  acceptedDeclarations: [] as {
    declarationId: string;
    esign: { basedOnSha256: string; signedAt: Date };
  }[],
  acceptedMinutes: [] as {
    esign: { basedOnSha256: string; signedAt: Date };
    meetingId: string;
  }[],
  archived: [] as boolean[],
  audited: [] as string[],
  closed: 0,
  dropped: 0,
  notices: 0,
  recorded: [] as { basedOnSha256: string; now: Date; trusteeId: string }[],
  takenWith: [] as string[][],
};

class CertificateError extends Error {}
class MeetingError extends Error {}
class DeclarationError extends Error {}

mock.module("@pi-dash/db/queries/esign", () => ({
  getEsignDocumentFor: async () => state.doc,
}));
mock.module("@pi-dash/db/queries/meetings", () => ({
  getMeeting: async () => state.getMeetingAfter ?? state.meeting,
  loadMeetingRecord: async () =>
    state.meeting ? { agenda: [], meeting: state.meeting } : null,
  MeetingError,
}));
mock.module("@pi-dash/db/queries/policies", () => ({
  DeclarationError,
  getConflictDeclaration: async () => state.declaration,
}));
mock.module("@pi-dash/db/queries/utilisation-certificates", () => ({
  CertificateError,
  getCertificate: async () => state.certificate,
  recordCertificateSignature: async (
    input: { basedOnSha256: string; sha256: string; trusteeId: string },
    _database: unknown,
    now: Date
  ) => {
    if (!["head", "finance"].includes(input.trusteeId)) {
      throw new CertificateError("You aren't a signatory.");
    }
    calls.recorded.push({ ...input, now });
    state.certificate = { ...state.certificate, latestSha256: input.sha256 };
    return input.trusteeId === "head" ? "awaiting_finance" : "final";
  },
}));
mock.module("../audit", () => ({
  runAuditedAction: async (
    params: { action: string },
    run: () => Promise<unknown>
  ) => {
    calls.audited.push(params.action);
    return await run();
  },
}));
mock.module("../grants/utilisation-certificates", () => ({
  certificateKey: (id: string, name: string) => `c/${id}/${name}`,
  enqueueCertificateNotice: () => {
    calls.notices += 1;
  },
  readLatest: async () => current,
}));
mock.module("../s3", () => ({
  getS3: async () => ({
    file: () => ({ arrayBuffer: async () => current }),
    write: async () => undefined,
  }),
}));
mock.module("./accept-signature", () => ({
  acceptSignedDeclaration: async (
    input: (typeof calls.acceptedDeclarations)[number]
  ) => {
    if (state.acceptError) {
      throw state.acceptError;
    }
    calls.acceptedDeclarations.push(input);
    return "doc";
  },
  acceptSignedMinutes: async (
    input: (typeof calls.acceptedMinutes)[number]
  ) => {
    if (state.acceptError) {
      throw state.acceptError;
    }
    calls.acceptedMinutes.push(input);
    return "doc";
  },
  declarationKey: (id: string, name: string) => `d/${id}/${name}`,
  fileArchiveCopy: async (input: { esign?: boolean }) => {
    calls.archived.push(input.esign === true);
  },
  meetingKey: (id: string, name: string) => `m/${id}/${name}`,
}));
mock.module("./esign", () => ({
  assertSignersHaveAccounts: async () => undefined,
  closeEsign: async () => {
    calls.closed += 1;
  },
  discardEsignDocument: async () => undefined,
  dropEsignDocument: async () => {
    calls.dropped += 1;
  },
  sendForEsign: async () => {
    throw new Error("not in these tests");
  },
  signerActor: async (trusteeId: string) => ({
    name: trusteeId,
    role: "admin",
    userId: `u-${trusteeId}`,
  }),
  signingLinkIn: async () => "https://l/sign",
  takeNewEsigns: async (_doc: unknown, _current: unknown, signed: string[]) => {
    calls.takenWith.push(signed);
    return state.taken;
  },
  withdrawEsign: async () => undefined,
}));
mock.module("./signing-service", () => ({
  validateEsignPdf: async () => ({ signatures: [], status: "valid" }),
}));

const {
  assertDscSigned,
  collectCertificateEsign,
  collectDeclarationEsign,
  collectMinutesEsign,
} = await import("./esign-documents");

const SIGNED_AT = "2026-10-20T05:00:00.000Z";

beforeEach(() => {
  state.doc = { closedAt: null, documentId: "DOC1", id: "e1" };
  state.taken = null;
  state.acceptError = null;
  state.getMeetingAfter = null;
  state.meeting = {
    chairTrusteeId: "chair",
    id: "m1",
    minutesDocumentId: null as string | null,
    minutesObjectKey: "m/m1/minutes.pdf",
    minutesSha256: sha(current),
    minutesSigningMode: "esign",
    title: "Board meeting",
  };
  state.declaration = {
    fiscalYear: "2026-27",
    id: "d1",
    legalName: "Asha Rao",
    objectKey: "d/t1/2026-27.pdf",
    sha256: sha(current),
    signingMode: "esign",
    status: "awaiting_signature",
    trusteeId: "t1",
  };
  state.certificate = {
    financeTrusteeId: "finance",
    headTrusteeId: "head",
    id: "c1",
    latestSha256: sha(current),
    number: "UC/2026-27/001",
    signingMode: "esign",
    status: "awaiting_head",
  };
  for (const list of Object.values(calls)) {
    if (Array.isArray(list)) {
      list.length = 0;
    }
  }
  calls.closed = 0;
  calls.dropped = 0;
  calls.notices = 0;
});

describe("collectMinutesEsign", () => {
  it("accepts the chair's eSign against the copy it checked, and closes the document", async () => {
    state.taken = {
      added: [{ end: 8, signedAt: SIGNED_AT, trusteeId: "chair" }],
      file: signedFile,
      report: {},
    };
    expect(await collectMinutesEsign("m1")).toBe("recorded");
    expect(calls.acceptedMinutes[0]?.esign.basedOnSha256).toBe(sha(current));
    expect(calls.audited).toEqual(["meeting.sign_minutes"]);
    expect(calls.closed).toBe(1);
  });

  it("waits while the chair hasn't signed", async () => {
    expect(await collectMinutesEsign("m1")).toBe("waiting");
    expect(calls.acceptedMinutes).toEqual([]);
    expect(calls.closed + calls.dropped).toBe(0);
  });

  it("withdraws the document of minutes made again for the DSC, without a trail", async () => {
    state.meeting = { ...state.meeting, minutesSigningMode: "dsc" };
    expect(await collectMinutesEsign("m1")).toBe("waiting");
    expect(calls.dropped).toBe(1);
    expect(calls.closed).toBe(0);
    expect(calls.takenWith).toEqual([]);
  });

  it("says already signed when another check took it", async () => {
    state.meeting = { ...state.meeting, minutesDocumentId: "doc" };
    expect(await collectMinutesEsign("m1")).toBe("signed");
    expect(calls.closed).toBe(1);
  });

  it("says already signed when it loses the race to record it", async () => {
    state.taken = {
      added: [{ end: 8, signedAt: SIGNED_AT, trusteeId: "chair" }],
      file: signedFile,
      report: {},
    };
    state.acceptError = new MeetingError("The minutes are already signed.");
    state.getMeetingAfter = { ...state.meeting, minutesDocumentId: "doc" };
    expect(await collectMinutesEsign("m1")).toBe("signed");
  });

  it("refuses when the minutes were made again meanwhile", async () => {
    state.taken = {
      added: [{ end: 8, signedAt: SIGNED_AT, trusteeId: "chair" }],
      file: signedFile,
      report: {},
    };
    state.acceptError = new MeetingError(
      "The minutes were generated again. Sign the new copy."
    );
    await expect(collectMinutesEsign("m1")).rejects.toThrow("generated again");
  });
});

describe("collectDeclarationEsign", () => {
  it("accepts the trustee's eSign as of when they signed", async () => {
    state.taken = {
      added: [{ end: 8, signedAt: SIGNED_AT, trusteeId: "t1" }],
      file: signedFile,
      report: {},
    };
    expect(await collectDeclarationEsign("d1")).toBe("recorded");
    expect(calls.acceptedDeclarations[0]?.esign).toMatchObject({
      basedOnSha256: sha(current),
      signedAt: new Date(SIGNED_AT),
    });
    expect(calls.audited).toEqual(["governance.sign_declaration"]);
  });

  it("says already signed for a declaration no longer waiting", async () => {
    state.declaration = {
      ...state.declaration,
      documentId: "doc",
      status: "signed",
    };
    expect(await collectDeclarationEsign("d1")).toBe("signed");
    expect(calls.closed).toBe(1);
  });
});

describe("collectCertificateEsign", () => {
  it("records the head's then the finance signer's eSign, each on the copy before and as of when made", async () => {
    state.taken = {
      added: [
        { end: 6, signedAt: SIGNED_AT, trusteeId: "head" },
        { end: 8, signedAt: SIGNED_AT, trusteeId: "finance" },
      ],
      file: signedFile,
      report: {},
    };
    expect(await collectCertificateEsign("c1")).toBe(2);
    expect(calls.recorded.map((r) => r.trusteeId)).toEqual(["head", "finance"]);
    expect(calls.recorded[1]?.basedOnSha256).toBe(sha(signedFile.slice(0, 6)));
    expect(calls.recorded[0]?.now).toEqual(new Date(SIGNED_AT));
    // The finance signer is asked; the final copy gets its long-term copy.
    expect(calls.notices).toBe(1);
    expect(calls.archived).toEqual([true]);
    expect(calls.closed).toBe(1);
  });

  it("checks the finance signer's eSign against the head's signed copy", async () => {
    state.certificate = { ...state.certificate, status: "awaiting_finance" };
    await collectCertificateEsign("c1");
    expect(calls.takenWith).toEqual([["head"]]);
  });

  it("withdraws the document of a cancelled certificate, without a trail", async () => {
    state.certificate = { ...state.certificate, status: "cancelled" };
    expect(await collectCertificateEsign("c1")).toBe(0);
    expect(calls.dropped).toBe(1);
    expect(calls.closed).toBe(0);
  });

  it("stops at a signature refused once the first is recorded", async () => {
    state.taken = {
      added: [
        { end: 6, signedAt: SIGNED_AT, trusteeId: "head" },
        { end: 8, signedAt: SIGNED_AT, trusteeId: "stranger" },
      ],
      file: signedFile,
      report: {},
    };
    await expect(collectCertificateEsign("c1")).rejects.toThrow();
    expect(calls.recorded.map((r) => r.trusteeId)).toEqual(["head"]);
  });
});

describe("assertDscSigned", () => {
  it("refuses the DSC helper and Acrobat copy on an eSign document", async () => {
    await expect(assertDscSigned({ declarationId: "d1" })).rejects.toThrow(
      "Leegality only"
    );
    state.declaration = { ...state.declaration, signingMode: "dsc" };
    await expect(assertDscSigned({ declarationId: "d1" })).resolves.toBe(
      undefined
    );
  });
});
