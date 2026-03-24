import { redirect } from "@tanstack/react-router";

export function assertOriented(context: {
  session: {
    user: { role?: string | null; attendedOrientation?: boolean | null };
  };
}) {
  const { user } = context.session;
  if (user.role !== "admin" && !user.attendedOrientation) {
    throw redirect({ to: "/" });
  }
}

export function assertAdmin(context: {
  session: {
    user: { role?: string | null };
  };
}) {
  const { user } = context.session;
  if (user.role !== "admin") {
    throw redirect({ to: "/" });
  }
}
