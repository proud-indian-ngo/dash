import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { computeReimbursementStats } from "@/components/reimbursements/reimbursement-stats";
import { ReimbursementsTable } from "@/components/reimbursements/reimbursements-table";
import { StatsCards } from "@/components/stats/stats-cards";
import { deleteUploadedAssets } from "@/functions/attachments";

export const Route = createFileRoute("/_app/reimbursements/")({
  loader: ({ context }) => {
    context.zero?.run(queries.reimbursement.all());
  },
  component: ReimbursementsRouteComponent,
});

function ReimbursementsRouteComponent() {
  const { session } = Route.useRouteContext();
  const isAdmin = session.user.role === "admin";
  const navigate = useNavigate();
  const zero = useZero();

  const [data, result] = useQuery(queries.reimbursement.all());

  const isLoading = result.type === "unknown";

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const item = await zero.run(queries.reimbursement.byId({ id }));
        const r2Keys =
          item?.attachments
            ?.filter((a) => a.type === "file" && a.objectKey)
            .map((a) => a.objectKey as string) ?? [];

        if (r2Keys.length > 0) {
          await deleteUploadedAssets({ data: { keys: r2Keys } });
        }

        await zero.mutate(mutators.reimbursement.delete({ id }));
        toast.success("Reimbursement deleted");
      } catch {
        toast.error("Failed to delete reimbursement");
      }
    },
    [zero]
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Reimbursements</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        {isAdmin
          ? "Review and manage all reimbursement requests."
          : "Submit and track your reimbursement requests."}
      </p>

      <div className="mt-6 grid gap-6">
        <StatsCards items={computeReimbursementStats(data ?? [])} />
        <ReimbursementsTable
          data={data ?? []}
          isLoading={isLoading}
          onDelete={handleDelete}
          onNavigate={(id) => {
            navigate({ to: "/reimbursements/$id", params: { id } });
          }}
          toolbarActions={
            <Button
              onClick={() => {
                navigate({ to: "/reimbursements/new" });
              }}
              size="sm"
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              New request
            </Button>
          }
        />
      </div>
    </div>
  );
}
