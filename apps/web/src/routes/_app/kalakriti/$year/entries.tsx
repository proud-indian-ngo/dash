import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { canAccessKalakritiEntries } from "@/lib/kalakriti-entry-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/entries")({
  beforeLoad: ({ context }) => {
    if (!canAccessKalakritiEntries(context.kalakritiEditionAccess)) {
      throw notFound();
    }
  },
  component: Outlet,
});
