import { Button } from "@pi-dash/design-system/components/ui/button";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader } from "@/components/loader";

export const Route = createFileRoute("/_app/kalakriti/")({
  component: KalakritiIndexRoute,
});

function KalakritiIndexRoute() {
  const [editions, result] = useQuery(queries.kalakritiEdition.accessible());
  const navigate = useNavigate();

  useEffect(() => {
    const latest = editions.at(0);
    if (latest) {
      navigate({
        params: { year: latest.year },
        replace: true,
        to: "/kalakriti/$year",
      });
    }
  }, [editions, navigate]);

  if (result.type !== "complete") {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (editions.length > 0) {
    return null;
  }

  return (
    <div className="app-container mx-auto max-w-3xl px-2 py-10 sm:px-4">
      <div className="border bg-card p-8 text-center">
        <h1 className="font-display font-semibold text-2xl">Kalakriti</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
          Create the first yearly Edition before configuring registrations and
          competitions.
        </p>
        <Button
          className="mt-6"
          nativeButton={false}
          render={<Link to="/kalakriti/new" />}
        >
          Create Edition
        </Button>
      </div>
    </div>
  );
}
