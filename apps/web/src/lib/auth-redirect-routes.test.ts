import { beforeEach, describe, expect, it, mock } from "bun:test";

const getSession = mock(async (): Promise<unknown> => null);
const verifyEmail = mock(async (): Promise<unknown> => ({ status: true }));
const findUnverifiedUserForToken = mock(async (): Promise<unknown> => ({
  id: "user-1",
  name: "Asha",
}));
const fileVerifiedSignUpInterest = mock(async () => undefined);

mock.module("@/functions/get-session", () => ({ getSession }));
mock.module("@pi-dash/auth", () => ({ auth: { api: { verifyEmail } } }));
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

const { Route: VerifyEmailRoute } = await import("@/routes/_auth/verify-email");

const EVENT_ID = "019a0000-0000-7000-8000-000000000001";

/** Run a guard and return the redirect target it throws, or null. */
async function redirectOf(run: () => unknown): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (thrown) {
    const options = (thrown as { options?: Record<string, unknown> }).options;
    if (!options) {
      throw thrown;
    }
    return options.href ?? { search: options.search, to: options.to };
  }
}

function verifyGuard(search: Record<string, unknown>) {
  const beforeLoad = VerifyEmailRoute.options.beforeLoad;
  if (!beforeLoad) {
    throw new Error("Missing verify-email guard");
  }
  return () =>
    beforeLoad({ search } as unknown as Parameters<typeof beforeLoad>[0]);
}

beforeEach(() => {
  getSession.mockReset();
  verifyEmail.mockReset();
  verifyEmail.mockResolvedValue({ status: true });
  findUnverifiedUserForToken.mockReset();
  findUnverifiedUserForToken.mockResolvedValue({ id: "user-1", name: "Asha" });
  fileVerifiedSignUpInterest.mockReset();
});

describe("verify-email guard", () => {
  it("files the website interest on first verification and lands on the event", async () => {
    expect(
      await redirectOf(
        verifyGuard({
          redirect: `/events/${EVENT_ID}?occDate=2026-10-18&interest=1`,
          token: "t",
        })
      )
    ).toEqual({
      search: {
        redirect: `/events/${EVENT_ID}?occDate=2026-10-18`,
        status: "email-verified",
      },
      to: "/login",
    });
    expect(fileVerifiedSignUpInterest).toHaveBeenCalledWith(
      { id: "user-1", name: "Asha" },
      { eventId: EVENT_ID, occDate: "2026-10-18" }
    );
  });

  it("does not file interest for an account that was already verified", async () => {
    findUnverifiedUserForToken.mockResolvedValue(null);
    await redirectOf(
      verifyGuard({ redirect: `/events/${EVENT_ID}?interest=1`, token: "t" })
    );
    expect(fileVerifiedSignUpInterest).not.toHaveBeenCalled();
  });

  it("only redirects to the event without the interest marker", async () => {
    expect(
      await redirectOf(
        verifyGuard({ redirect: `/events/${EVENT_ID}`, token: "t" })
      )
    ).toEqual({
      search: { redirect: `/events/${EVENT_ID}`, status: "email-verified" },
      to: "/login",
    });
    expect(findUnverifiedUserForToken).not.toHaveBeenCalled();
    expect(fileVerifiedSignUpInterest).not.toHaveBeenCalled();
  });

  it("drops redirects that are not event pages", async () => {
    expect(
      await redirectOf(
        verifyGuard({ redirect: "https://evil.example/events/x", token: "t" })
      )
    ).toEqual({
      search: { redirect: undefined, status: "email-verified" },
      to: "/login",
    });
  });

  it("files nothing when verification fails", async () => {
    verifyEmail.mockResolvedValue(null);
    await redirectOf(
      verifyGuard({ redirect: `/events/${EVENT_ID}?interest=1`, token: "t" })
    );
    expect(fileVerifiedSignUpInterest).not.toHaveBeenCalled();
  });
});
