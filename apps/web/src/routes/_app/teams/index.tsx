import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { TeamsTable } from "@/components/teams/teams-table";
import { useApp } from "@/context/app-context";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";
import { handleMutationResult } from "@/lib/mutation-result";

export const Route = createFileRoute("/_app/teams/")({
  head: () => ({
    meta: [{ title: `Teams | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.run(queries.team.all());
  },
  component: TeamsRouteComponent,
});

function TeamsRouteComponent() {
  const { isAdmin } = useApp();
  const navigate = useNavigate();
  const zero = useZero();
  const [createOpen, setCreateOpen] = useState(false);

  const [data, result] = useQuery(queries.team.all());
  const isLoading = useZeroQueryStatus(result);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await zero.mutate(mutators.team.delete({ id })).server;
      handleMutationResult(res, {
        mutation: "team.delete",
        entityId: id,
        successMsg: "Team deleted",
        errorMsg: "Failed to delete team",
      });
    },
    [zero]
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Teams</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        {isAdmin
          ? "Manage teams and their members."
          : "View the teams you belong to."}
      </p>

      <div className="mt-6 grid gap-6 *:min-w-0">
        <TeamsTable
          data={data ?? []}
          isLoading={isLoading}
          onDelete={handleDelete}
          onNavigate={(id) => {
            navigate({ to: "/teams/$id", params: { id } });
          }}
          toolbarActions={
            isAdmin ? (
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
                Create Team
              </Button>
            ) : undefined
          }
        />
      </div>

      {isAdmin ? (
        <TeamFormDialog onOpenChange={setCreateOpen} open={createOpen} />
      ) : null}
    </div>
  );
}
