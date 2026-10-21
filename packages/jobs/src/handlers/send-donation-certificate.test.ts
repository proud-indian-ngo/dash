import { beforeEach, describe, expect, it, mock } from "bun:test";

// Keep the real database, Resend and R2 out of the test.
mock.module("@pi-dash/db/queries/donation-filings", () => ({
  certificateFileName: (ack: string) => `Form-114-${ack}.pdf`,
  loadCertificateEmailTarget: async () => null,
  markCertificateEmailed: async () => undefined,
  markCertificateEmailFailed: async () => undefined,
}));
mock.module("@pi-dash/db/queries/email-suppression", () => ({
  getEmailSuppression: async () => null,
}));
mock.module("@pi-dash/email", () => ({
  renderDonationCertificateEmail: async () => "",
}));
class EmailSendError extends Error {
  readonly code: string;
  readonly statusCode: number | null;
  constructor(code: string, message: string, statusCode: number | null) {
    super(`Resend ${code}: ${message}`);
    this.code = code;
    this.statusCode = statusCode;
  }
}
mock.module("@pi-dash/email/mailer", () => ({
  EmailSendError,
  sendEmail: async () => ({ status: "skipped" as const }),
}));
mock.module("./create-handler", () => ({
  createNotifyHandler: () => async () => ({}),
}));
mock.module("./r2", () => ({ getR2Client: () => ({}) }));

const { sendDonationCertificate } = await import("./send-donation-certificate");
type Deps = NonNullable<Parameters<typeof sendDonationCertificate>[1]>;

const target = {
  acknowledgementNumber: "114000000000001",
  donorName: "Test Donor",
  email: "donor@example.test",
  emailedAt: null as Date | null,
  emailRequestId: "q1" as string | null,
  fileName: "a.pdf",
  fileObjectKey: "test/donation-filings/f1/certificates/c1.pdf",
  fiscalYear: "2026-27",
  id: "c1",
};

let sent: Record<string, unknown>[] = [];
let marked: string[] = [];
let failed: string[] = [];

function deps(overrides: Partial<Deps> = {}): Deps {
  return {
    getSuppression: async () => null,
    loadTarget: async () => ({ ...target }),
    markEmailed: async (id, requestId) => {
      marked.push(`${id}:${requestId}`);
    },
    markFailed: async (id, requestId, failure) => {
      failed.push(`${id}:${requestId}:${failure}`);
    },
    readPdf: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    renderEmail: async () => "<p>Certificate</p>",
    send: async (options) => {
      sent.push(options as unknown as Record<string, unknown>);
      return { id: "email-1", status: "sent" as const };
    },
    ...overrides,
  };
}

const payload = { certificateId: "c1", requestId: "q1" };

describe("sendDonationCertificate", () => {
  beforeEach(() => {
    sent = [];
    marked = [];
    failed = [];
  });

  it("emails the PDF once under a key for this request and stamps it", async () => {
    expect(await sendDonationCertificate(payload, deps())).toEqual({
      outcome: "sent",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      attachments: [{ filename: "Form-114-114000000000001.pdf" }],
      idempotencyKey: "donation-certificate-c1-q1",
      subject: "Your Form 114 donation certificate for FY 2026-27",
      to: "donor@example.test",
    });
    expect(marked).toEqual(["c1:q1"]);
  });

  it("sends nothing for a certificate already sent or claimed again since", async () => {
    expect(
      await sendDonationCertificate(
        payload,
        deps({
          loadTarget: async () => ({ ...target, emailedAt: new Date() }),
        })
      )
    ).toEqual({ outcome: "already_sent" });
    expect(
      await sendDonationCertificate(
        payload,
        deps({
          loadTarget: async () => ({ ...target, emailRequestId: "q2" }),
        })
      )
    ).toEqual({ outcome: "superseded" });
    expect(
      await sendDonationCertificate(
        payload,
        deps({ loadTarget: async () => null })
      )
    ).toEqual({ outcome: "missing" });
    expect(sent).toEqual([]);
    expect(marked).toEqual([]);
  });

  it("stamps why a certificate couldn't be emailed", async () => {
    await sendDonationCertificate(
      payload,
      deps({ loadTarget: async () => ({ ...target, email: null }) })
    );
    await sendDonationCertificate(
      payload,
      deps({
        getSuppression: async () => ({
          createdAt: new Date(),
          reason: "hard_bounce",
        }),
      })
    );
    await sendDonationCertificate(
      payload,
      deps({ send: async () => ({ status: "skipped" as const }) })
    );
    expect(failed).toEqual([
      "c1:q1:no_email",
      "c1:q1:suppressed",
      "c1:q1:not_configured",
    ]);
    expect(marked).toEqual([]);
  });

  it("records a failed send and rethrows it for a retry", async () => {
    await expect(
      sendDonationCertificate(
        payload,
        deps({
          send: async () => {
            throw new EmailSendError("server_error", "down", 500);
          },
        })
      )
    ).rejects.toThrow("down");
    expect(failed).toEqual(["c1:q1:failed"]);
  });

  it("retries while another attempt with its key is in flight, marking nothing", async () => {
    await expect(
      sendDonationCertificate(
        payload,
        deps({
          send: async () => {
            throw new EmailSendError(
              "concurrent_idempotent_requests",
              "in progress",
              409
            );
          },
        })
      )
    ).rejects.toThrow("in progress");
    expect(failed).toEqual([]);
    expect(marked).toEqual([]);
  });

  it("records a reused key with another payload as failed, without a retry", async () => {
    expect(
      await sendDonationCertificate(
        payload,
        deps({
          send: async () => {
            throw new EmailSendError(
              "invalid_idempotent_request",
              "payload differs",
              409
            );
          },
        })
      )
    ).toEqual({ outcome: "failed" });
    expect(failed).toEqual(["c1:q1:failed"]);
    expect(marked).toEqual([]);
  });
});
