import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CenterFormDialog } from "@/components/centers/center-form-dialog";
import { CentersTable } from "@/components/centers/centers-table";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";

export const Route = createFileRoute("/_app/centers/")({
  head: () => ({
    meta: [{ title: `Centers | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.center.all());
  },
  component: CentersRouteComponent,
});

function CentersRouteComponent() {
  const { hasPermission } = useApp();
  const navigate = useNavigate();
  const zero = useZero();
  const [createOpen, setCreateOpen] = useState(false);

  const [data, result] = useQuery(queries.center.all());
  const isLoading = data.length === 0 && result.type !== "complete";

  const handleDelete = async (id: string) => {
    const res = await zero.mutate(mutators.center.delete({ id })).server;
    handleMutationResult(res, {
      mutation: "center.delete",
      entityId: id,
      successMsg: "Center deleted",
      errorMsg: "Couldn't delete center",
    });
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Centers
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <CentersTable
          data={data ?? []}
          isLoading={isLoading}
          onDelete={handleDelete}
          onNavigate={(id) => {
            navigate({ to: "/centers/$id", params: { id } });
          }}
          toolbarActions={
            hasPermission("centers.manage") ? (
              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                type="button"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add center
              </Button>
            ) : undefined
          }
        />
      </div>

      {hasPermission("centers.manage") ? (
        <CenterFormDialog onOpenChange={setCreateOpen} open={createOpen} />
      ) : null}
    </div>
  );
}
