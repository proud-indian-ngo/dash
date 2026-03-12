import { auth } from "@pi-dash/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const verifyEmailToken = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const result = await auth.api.verifyEmail({
      query: { token: data.token },
    });

    if (!result) {
      return { error: "Verification failed. The link may have expired." };
    }

    return { error: null };
  });

export const Route = createFileRoute("/_auth/verify-email")({
  head: () => ({
    meta: [{ title: "Verify Email | Proud Indian Dashboard" }],
  }),
  validateSearch: z.object({
    token: z.string().optional(),
  }),
  beforeLoad: async ({ search }) => {
    if (!search.token) {
      throw redirect({ to: "/login" });
    }

    const result = await verifyEmailToken({ data: { token: search.token } });

    if (!result.error) {
      throw redirect({
        to: "/login",
        search: { status: "email-verified" },
      });
    }

    return { verificationError: result.error };
  },
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { verificationError } = Route.useRouteContext();

  return (
    <>
      <h1 className="sr-only">Verify Email</h1>
      <p className="text-center text-destructive text-sm">
        {verificationError}
      </p>
    </>
  );
}
