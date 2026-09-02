import { Button } from "@pi-dash/design-system/components/ui/button";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { useApp } from "@/context/app-context";
import { getCurrentKalakritiEditionAccess } from "@/functions/kalakriti-access";

export const Route = createFileRoute("/_app/kalakriti/")({
  beforeLoad: async () => {
    const access = await getCurrentKalakritiEditionAccess();
    if (access) {
      throw redirect({
        params: { year: String(access.edition.year) },
        replace: true,
        to: "/kalakriti/$year",
      });
    }
  },
  component: KalakritiIndexRoute,
});

function KalakritiIndexRoute() {
  const { hasPermission } = useApp();

  return (
    <div className="app-container mx-auto max-w-3xl px-2 py-10 sm:px-4">
      <div className="bg-card border p-8 text-center">
        <h1 className="font-display text-2xl font-semibold">Kalakriti</h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
          {hasPermission("kalakriti.admin")
            ? "Create the first yearly Edition before configuring registrations and competitions."
            : "You don't have an active Kalakriti Edition assignment."}
        </p>
        {hasPermission("kalakriti.admin") ? (
          <Button
            className="mt-6"
            nativeButton={false}
            render={<Link to="/kalakriti/new" />}
          >
            Create Edition
          </Button>
        ) : null}
      </div>
    </div>
  );
}
