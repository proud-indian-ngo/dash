import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/reimbursements")({
  component: () => <Outlet />,
});
