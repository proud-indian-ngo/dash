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

const { Route: AuthRoute } = await import("@/routes/_auth");
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

function authGuard(pathname: string, search: Record<string, unknown>) {
  const beforeLoad = AuthRoute.options.beforeLoad;
  if (!beforeLoad) {
    throw new Error("Missing _auth guard");
  }
  return () =>
    beforeLoad({ location: { pathname, search } } as unknown as Parameters<
      typeof beforeLoad
    >[0]);
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

describe("_auth guard", () => {
  it("lets signed-out visitors register", async () => {
    getSession.mockResolvedValue(null);
    expect(
      await redirectOf(authGuard("/register", { interestEventId: EVENT_ID }))
    ).toBeNull();
  });

  it("sends signed-in visitors on a website link to the event session", async () => {
    getSession.mockResolvedValue({ user: { id: "u" } });
    expect(
      await redirectOf(
        authGuard("/register", {
          interestEventId: EVENT_ID,
          occDate: "2026-10-18",
        })
      )
    ).toBe(`/events/${EVENT_ID}?occDate=2026-10-18`);
  });

  it("keeps invite links and other auth pages going home", async () => {
    getSession.mockResolvedValue({ user: { id: "u" } });
    expect(
      await redirectOf(authGuard("/register", { eventId: EVENT_ID }))
    ).toEqual({ search: undefined, to: "/" });
    expect(
      await redirectOf(authGuard("/login", { interestEventId: EVENT_ID }))
    ).toEqual({ search: undefined, to: "/" });
  });
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
