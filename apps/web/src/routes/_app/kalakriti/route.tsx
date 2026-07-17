import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/kalakriti")({
  beforeLoad: ({ context }) => assertPermission(context, "kalakriti.view"),
  component: Outlet,
});
