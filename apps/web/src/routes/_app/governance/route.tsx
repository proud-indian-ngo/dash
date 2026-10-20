import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Each governance page guards itself: finance may see registrations, and a
 * trustee without governance.view still opens the circulars sent to them.
 */
export const Route = createFileRoute("/_app/governance")({
  component: () => <Outlet />,
});
