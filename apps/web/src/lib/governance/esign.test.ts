import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

import type { GovernanceValidationReport } from "@pi-dash/db/schema/governance";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const CIRCULAR = "01930000-0000-7000-8000-00000000c1c1";
const current = new Uint8Array([1, 2, 3, 4]);
const signedFile = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const asha = {
  box: [300, 600, 547, 672],
  email: "asha@example.org",
  page: 2,
  trusteeId: "mt",
};
const vikram = {
  box: [300, 472, 547, 544],
  email: "vikram@example.org",
  page: 2,
  trusteeId: "sec",
};

class ResolutionError extends Error {}

/** What each test sets up; `reset` restores it. */
const state = {
  circular: { id: CIRCULAR, responseDueOn: "2026-11-06", signingMode: "esign" },
  closedAt: null as Date | null,
  contacts: [] as Record<string, string | null>[],
  invitations: [] as Record<string, unknown>[],
  latest: { objectKey: "p/latest.pdf", sha256: sha(current) },
  objects: new Map<string, Uint8Array>(),
  recordSignature: mock(
    async (input: {
      basedOnSha256: string;
      method: string;
      sha256: string;
      today: string;
      trusteeId: string;
    }) => {
      state.latest = { objectKey: "p/next.pdf", sha256: input.sha256 };
      return [] as { resolutionId: string; status: string }[];
    }
  ),
  report: null as GovernanceValidationReport | null,
  samePages: true,
  signers: [] as string[],
};

const calls = {
  audited: [] as string[],
  closed: 0,
  deleted: [] as string[],
  details: [] as boolean[],
  filed: [] as number[],
  validated: [] as number[],
};

function sig(
  fieldName: string,
  overrides: Partial<GovernanceValidationReport["signatures"][number]>
): GovernanceValidationReport["signatures"][number] {
  return {
    certifies: false,
    coversWholeRevision: true,
    fieldName,
    intact: true,
    issuer: "Protean eGov Sub CA 2026",
    locks: [],
    matchedTrusteeId: null,
    modificationLevel: "FORM_FILLING",
    notAfter: null,
    notBefore: null,
    page: 2,
    serial: "1",
    sha256Fingerprint: "f".repeat(64),
    signerName: "ASHA RAO",
    signingTime: null,
    subject: "CN=ASHA RAO",
    timestamped: true,
    timestampTime: "2026-11-01T10:00:00+00:00",
    trusted: true,
    ...overrides,
  };
}

const twoSignatures = (): GovernanceValidationReport => ({
  changesSinceBase: "FORM_FILLING",
  checkedAt: "",
  signatures: [
    sig("l1", { end: 6, rect: [310, 610, 409, 669] }),
    sig("l2", {
      end: 8,
      rect: [310, 480, 409, 539],
      signerName: "VIKRAM MENON",
    }),
  ],
  status: "valid",
});

mock.module("@pi-dash/env/server", () => ({ env: { R2_KEY_PREFIX: "p" } }));
mock.module("@pi-dash/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => [
              { name: "Asha Rao", role: "admin", userId: "u-mt" },
            ],
          }),
        }),
      }),
    }),
  },
}));
mock.module("@pi-dash/db/schema/auth", () => ({ user: {} }));
mock.module("@pi-dash/db/schema/governance", () => ({ trustee: {} }));
mock.module("@pi-dash/db/queries/esign", () => ({
  circularSigners: async () => state.signers,
  esignContacts: async () => state.contacts,
  getEsignDocument: async () => ({
    closedAt: state.closedAt,
    documentId: "DOC1",
    invitees: [asha, vikram],
  }),
  latestCircularPdf: async () => state.latest,
  setEsignClosed: async () => {
    calls.closed += 1;
  },
}));
mock.module("@pi-dash/db/queries/governance", () => ({
  fileGovernanceDocumentOnce: async () => "doc",
  trusteeNamesForMatching: async () => [
    { id: "mt", names: ["Asha Rao"] },
    { id: "sec", names: ["Vikram Menon"] },
  ],
}));
mock.module("@pi-dash/db/queries/resolutions", () => ({
  circularResolutions: async () => [{ status: "issued" }],
  currentRevision: async () => null,
  getCircular: async () => state.circular,
  getResolution: async () => null,
  ResolutionError,
  recordSignature: state.recordSignature,
  signerState: async () => ({
    answers: [{ answer: "assent", position: 1 }],
    fieldName: "Trustee_x",
    openAssents: 1,
  }),
}));
mock.module("../s3", () => ({
  getS3: async () => ({
    file: (key: string) => ({
      arrayBuffer: async () => state.objects.get(key) ?? new Uint8Array(),
    }),
    write: async (key: string, bytes: Uint8Array) => {
      state.objects.set(key, bytes);
    },
  }),
}));
mock.module("../audit", () => ({
  runAuditedAction: async (
    params: { actor: { userId: string } },
    run: () => Promise<unknown>
  ) => {
    calls.audited.push(params.actor.userId);
    return await run();
  },
}));
mock.module("./accept-signature", () => ({
  enqueueDecided: () => undefined,
  fileFinalCopy: async (
    _id: string,
    _passed: string[],
    signed: { bytes: Uint8Array }
  ) => {
    calls.filed.push(signed.bytes.byteLength);
  },
}));
mock.module("./leegality", () => ({
  createEsignDocument: async () => "DOC1",
  deleteEsignDocument: async (id: string) => {
    calls.deleted.push(id);
  },
  deleteEsignInvitation: async () => undefined,
  esignDocumentState: async (_id: string, options: { file: boolean }) => {
    calls.details.push(options.file);
    return {
      auditTrail: null,
      completed: false,
      file: options.file ? signedFile : null,
      invitations: state.invitations,
    };
  },
  LeegalityError: class extends Error {},
}));
mock.module("./signing-service", () => ({
  fillAnswers: async () => new Uint8Array(),
  prepareForEsign: async (pdf: Uint8Array) => ({ pageCount: 3, pdf }),
  samePages: async () => state.samePages,
  validateEsignPdf: async (bytes: Uint8Array) => {
    calls.validated.push(bytes.byteLength);
    return state.report;
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: () => undefined,
  }),
}));

const {
  assertNotEsigned,
  collectEsignatures,
  esignSigningLink,
  sendCircularForEsign,
} = await import("./esign");

const signedBoth = [
  { email: asha.email, signed: true },
  { email: vikram.email, signed: true },
];

beforeEach(() => {
  state.circular = {
    id: CIRCULAR,
    responseDueOn: "2026-11-06",
    signingMode: "esign",
  };
  state.closedAt = null;
  state.invitations = signedBoth;
  state.latest = { objectKey: "p/latest.pdf", sha256: sha(current) };
  state.objects = new Map([["p/latest.pdf", current]]);
  state.report = twoSignatures();
  state.samePages = true;
  state.signers = [];
  state.recordSignature.mockClear();
  state.recordSignature.mockImplementation(async (input) => {
    state.latest = { objectKey: "p/next.pdf", sha256: input.sha256 };
    return [{ resolutionId: "r1", status: "issued" }];
  });
  for (const list of Object.values(calls)) {
    if (Array.isArray(list)) {
      list.length = 0;
    }
  }
  calls.closed = 0;
});

describe("collectEsignatures", () => {
  it("records each new eSign in signing order, as of its timestamp, in the signer's name", async () => {
    const recorded = await collectEsignatures(CIRCULAR);
    expect(recorded.map((r) => r.trusteeId)).toEqual(["mt", "sec"]);
    const inputs = state.recordSignature.mock.calls.map(([input]) => input);
    expect(inputs.map((i) => [i.method, i.today])).toEqual([
      ["esign", "2026-11-01"],
      ["esign", "2026-11-01"],
    ]);
    // Each extends the copy the one before left.
    expect(inputs[0]?.basedOnSha256).toBe(sha(current));
    expect(inputs[1]?.basedOnSha256).toBe(sha(signedFile.slice(0, 6)));
    expect(calls.audited).toEqual(["u-mt", "u-mt"]);
  });

  it("doesn't download the file when Leegality has nothing new", async () => {
    state.signers = ["mt", "sec"];
    expect(await collectEsignatures(CIRCULAR)).toEqual([]);
    expect(calls.details).toEqual([false]);
  });

  it("files a passed resolution's evidence with the check of that copy, then closes the document", async () => {
    state.recordSignature.mockImplementationOnce(async (input) => {
      state.latest = { objectKey: "p/next.pdf", sha256: input.sha256 };
      return [{ resolutionId: "r1", status: "passed" }];
    });
    const recorded = await collectEsignatures(CIRCULAR);
    // Decided on the first: the second isn't taken.
    expect(recorded.map((r) => r.trusteeId)).toEqual(["mt"]);
    expect(calls.filed).toEqual([6]);
    expect(calls.validated).toEqual([8, 6]);
    expect(calls.deleted).toEqual(["DOC1"]);
    expect(calls.closed).toBe(1);
  });

  it("stops at an eSign made after the response date", async () => {
    state.circular = { ...state.circular, responseDueOn: "2026-10-31" };
    expect(await collectEsignatures(CIRCULAR)).toEqual([]);
    expect(state.recordSignature).not.toHaveBeenCalled();
  });

  it("leaves it to another check that recorded it first", async () => {
    state.recordSignature.mockImplementationOnce(async () => {
      state.latest = { objectKey: "p/other.pdf", sha256: "moved" };
      throw new ResolutionError("Someone else signed while you were signing.");
    });
    expect(await collectEsignatures(CIRCULAR)).toEqual([]);
  });

  it("does nothing once the Leegality document is closed", async () => {
    state.closedAt = new Date();
    expect(await collectEsignatures(CIRCULAR)).toEqual([]);
    expect(calls.details).toEqual([]);
  });
});

describe("assertNotEsigned", () => {
  it("refuses an answer from a trustee who signed on Leegality, after taking the eSign", async () => {
    await expect(assertNotEsigned(CIRCULAR, "mt")).rejects.toThrow(
      "You've signed this circular on Leegality"
    );
    expect(state.recordSignature).toHaveBeenCalled();
  });

  it("lets a trustee who hasn't signed answer", async () => {
    state.invitations = [{ email: asha.email, signed: false }];
    await assertNotEsigned(CIRCULAR, "mt");
  });
});

describe("esignSigningLink", () => {
  it("opens the trustee's own link", async () => {
    state.invitations = [
      { email: asha.email, signed: false, url: "https://l/sign/a" },
      { email: vikram.email, signed: false, url: "https://l/sign/v" },
    ];
    expect(await esignSigningLink(CIRCULAR, "sec")).toBe("https://l/sign/v");
  });

  it("points a trustee who already signed to recording it", async () => {
    await expect(esignSigningLink(CIRCULAR, "mt")).rejects.toThrow(
      "You've signed it on Leegality"
    );
  });
});

describe("sendCircularForEsign", () => {
  const input = {
    circularId: CIRCULAR,
    rendered: new Uint8Array([1]),
    responseDueOn: "2026-11-06",
    signers: [{ trusteeId: "mt" }, { trusteeId: "sec" }],
    today: "2026-10-30",
  };

  it("refuses a response date Leegality can't keep the invitations to", async () => {
    await expect(
      sendCircularForEsign({ ...input, responseDueOn: "2026-12-30" })
    ).rejects.toThrow("at most 30 days");
  });

  it("needs a distinct email for every trustee", async () => {
    state.contacts = [
      {
        accountEmail: "same@example.org",
        contactEmail: null,
        id: "mt",
        legalName: "Asha Rao",
      },
      {
        accountEmail: null,
        contactEmail: "Same@example.org",
        id: "sec",
        legalName: "Vikram Menon",
      },
    ];
    await expect(sendCircularForEsign(input)).rejects.toThrow(
      "share the email"
    );
  });

  it("deletes the document when Leegality's copy shows other pages", async () => {
    state.contacts = [
      {
        accountEmail: "asha@example.org",
        contactEmail: null,
        id: "mt",
        legalName: "Asha Rao",
      },
      {
        accountEmail: null,
        contactEmail: "vikram@example.org",
        id: "sec",
        legalName: "Vikram Menon",
      },
    ];
    state.samePages = false;
    await expect(sendCircularForEsign(input)).rejects.toThrow("same pages");
    expect(calls.deleted).toEqual(["DOC1"]);
  });
});
