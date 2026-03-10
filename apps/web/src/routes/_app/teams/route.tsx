import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/teams")({
  component: () => <Outlet />,
});
