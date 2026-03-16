import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertOriented } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/advance-payments")({
  beforeLoad: ({ context }) => assertOriented(context),
  component: () => <Outlet />,
});
