import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { MEETING_MODE_LABELS } from "@pi-dash/shared/meetings";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { formatStartsAt } from "@/components/governance/meeting-data";
import { MeetingFormDialog } from "@/components/governance/meeting-form-dialog";
import { MeetingStatusBadge } from "@/components/governance/meeting-status";
import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";

export const Route = createFileRoute("/_app/governance/meetings/")({
  component: MeetingsPage,
  head: () => ({
    meta: [{ title: `Board meetings | ${env.VITE_APP_NAME}` }],
  }),
});

function MeetingsPage() {
  const { hasPermission } = useApp();
  const canSee =
    hasPermission("governance.view") || hasPermission("governance.manage");
  const canManage = hasPermission("governance.manage");
  const [all, allResult] = useQuery(queries.meeting.all());
  const [mine, mineResult] = useQuery(queries.meeting.mine());
  const rows = canSee ? all : mine;
  const isLoading =
    rows.length === 0 &&
    (canSee ? allResult.type : mineResult.type) !== "complete";
  const navigate = useNavigate();
  const [creating, setCreating] = useState<string | null>(null);

  const openCreate = useEventCallback(() => setCreating(uuidv7()));
  const handleCreated = useEventCallback((id: string) => {
    setCreating(null);
    navigate({
      params: { meetingId: id },
      to: "/governance/meetings/$meetingId",
    });
  });

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={openCreate} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              New meeting
            </Button>
          ) : null
        }
        description="Meetings of the Board: notice and agenda, attendance, the vote on each resolution under the deed in force that day, and minutes signed by the chair."
        title="Board meetings"
      />
      <div className="mt-6">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : null}
        {!isLoading && rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {canSee
              ? "No meetings yet."
              : "You haven't been given notice of a meeting."}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Meeting</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Agenda</TableHead>
                  <TableHead>Minutes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const agenda = row.agenda ?? [];
                  return (
                    <TableRow
                      className="cursor-pointer"
                      key={row.id}
                      onClick={() =>
                        navigate({
                          params: { meetingId: row.id },
                          to: "/governance/meetings/$meetingId",
                        })
                      }
                    >
                      <TableCell>
                        <span className="flex flex-col">
                          <span className="font-medium">{row.title}</span>
                          <span className="text-muted-foreground text-xs">
                            {row.place ||
                              MEETING_MODE_LABELS[row.mode ?? "hybrid"]}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <MeetingStatusBadge status={row.status ?? "draft"} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatStartsAt(row.startsAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {agenda.length === 1
                          ? "1 item"
                          : `${agenda.length} items`}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.minutesDocumentId ? "Signed" : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
      {creating ? (
        <MeetingFormDialog
          initial={{ mode: "hybrid", place: null, startsAt: null, title: "" }}
          meetingId={creating}
          mode="create"
          onOpenChange={(open) => {
            if (!open) {
              setCreating(null);
            }
          }}
          onSaved={handleCreated}
          open
        />
      ) : null}
    </div>
  );
}
