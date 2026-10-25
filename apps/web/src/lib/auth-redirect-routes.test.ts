import { beforeEach, describe, expect, it, mock } from "bun:test";

const verifyEmail = mock(async (): Promise<unknown> => ({ status: true }));
const findUnverifiedUserForToken = mock(async (): Promise<unknown> => ({
  id: "user-1",
  name: "Asha",
}));
const fileVerifiedSignUpInterest = mock(async () => undefined);
const hasPassword = mock(async () => true);
const welcomeVerifiedAssistantSignUp = mock(async () => undefined);

mock.module("@pi-dash/auth", () => ({ auth: { api: { verifyEmail } } }));
mock.module("@pi-dash/auth/assistant-sign-up", () => ({
  hasPassword,
  welcomeVerifiedAssistantSignUp,
}));
mock.module("@pi-dash/auth/register-interest-db", () => ({
  fileVerifiedSignUpInterest,
  findUnverifiedUserForToken,
}));
// Run server functions in-process: `.validator().handler(fn)` calls fn.
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      handler:
        (fn: (input: { data: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          fn(input),
      validator: () => builder,
    };
    return builder;
  },
}));

const { confirmEmailVerification } = await import("@/functions/verify-email");

const EVENT_ID = "019a0000-0000-7000-8000-000000000001";

function confirm(redirect?: string) {
  return confirmEmailVerification({ data: { redirect, token: "t" } });
}

beforeEach(() => {
  verifyEmail.mockReset();
  verifyEmail.mockResolvedValue({ status: true });
  findUnverifiedUserForToken.mockReset();
  findUnverifiedUserForToken.mockResolvedValue({ id: "user-1", name: "Asha" });
  fileVerifiedSignUpInterest.mockReset();
  hasPassword.mockReset();
  hasPassword.mockResolvedValue(true);
  welcomeVerifiedAssistantSignUp.mockReset();
  welcomeVerifiedAssistantSignUp.mockResolvedValue(undefined);
});

describe("confirming a verification link", () => {
  it("files the website interest on first verification and lands on the event", async () => {
    expect(
      await confirm(`/events/${EVENT_ID}?occDate=2026-10-18&interest=1`)
    ).toEqual({ href: `/events/${EVENT_ID}?occDate=2026-10-18` });
    expect(fileVerifiedSignUpInterest).toHaveBeenCalledWith(
      { id: "user-1", name: "Asha" },
      { eventId: EVENT_ID, occDate: "2026-10-18" }
    );
  });

  it("does not file interest for an account that was already verified", async () => {
    findUnverifiedUserForToken.mockResolvedValue(null);
    await confirm(`/events/${EVENT_ID}?interest=1`);
    expect(fileVerifiedSignUpInterest).not.toHaveBeenCalled();
  });

  it("only redirects to the event without the interest marker", async () => {
    expect(await confirm(`/events/${EVENT_ID}`)).toEqual({
      href: `/events/${EVENT_ID}`,
    });
    expect(fileVerifiedSignUpInterest).not.toHaveBeenCalled();
  });

  it("drops redirects that are not event pages", async () => {
    expect(await confirm("https://evil.example/events/x")).toEqual({
      href: "/",
    });
  });

  it("sends an assistant's passwordless sign-up to set a password first, and welcomes it", async () => {
    hasPassword.mockResolvedValue(false);
    expect(await confirm(`/events/${EVENT_ID}?interest=1`)).toEqual({
      href: `/set-password?redirect=${encodeURIComponent(`/events/${EVENT_ID}`)}`,
    });
    expect(fileVerifiedSignUpInterest).toHaveBeenCalled();
    expect(welcomeVerifiedAssistantSignUp).toHaveBeenCalledWith("user-1");
  });

  it("sends an already verified address to sign in", async () => {
    verifyEmail.mockRejectedValue(new Error("Email already verified"));
    expect(await confirm()).toEqual({
      href: "/login?status=email-verified",
    });
  });

  it("files nothing when verification fails", async () => {
    verifyEmail.mockResolvedValue(null);
    expect(await confirm(`/events/${EVENT_ID}?interest=1`)).toEqual({
      error: "Verification failed. The link may have expired.",
    });
    expect(fileVerifiedSignUpInterest).not.toHaveBeenCalled();
  });
});
