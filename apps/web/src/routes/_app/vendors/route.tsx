import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertOriented } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/vendors")({
  beforeLoad: ({ context }) => assertOriented(context),
  component: () => <Outlet />,
});
