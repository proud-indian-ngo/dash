import {
  CalendarSetting01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  PlusSignIcon,
  Undo02Icon,
  UserAccountIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { env } from "@pi-dash/env/web";
import {
  COMPLIANCE_STATUS_LABELS,
  type ComplianceItemStatus,
} from "@pi-dash/shared/compliance";
import {
  daysBetween,
  GOVERNANCE_PAGE_PERMISSIONS,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";

import { EvidenceLink, NO_DOCUMENT } from "@/components/governance/evidence";
import { PlainSelect } from "@/components/governance/plain-select";
import {
  epochToIso,
  formatIso,
  isoToDate,
  todayIso,
  useGovernanceDocuments,
} from "@/components/governance/register-data";
import { PageHeader, PageHeaderMenu } from "@/components/shared/page-header";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { getTrusteeAccountOptions } from "@/functions/governance";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/compliance")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...GOVERNANCE_PAGE_PERMISSIONS),
  component: CompliancePage,
  head: () => ({
    meta: [{ title: `Compliance calendar | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.compliance.items(),
      abortController.signal
    );
  },
});

type Filter = "open" | "closed" | "all";

interface Item {
  dueOn: string;
  evidenceDocumentId: string | null;
  id: string;
  note: string | null;
  ownerUserId: string | null;
  status: ComplianceItemStatus;
  title: string;
}

type Dialogs =
  | { kind: "close"; item: Item }
  | { kind: "waive"; item: Item }
  | { kind: "assign"; item: Item }
  | { kind: "add" }
  | { kind: "templates" }
  | null;

function dueBadge(item: Item, today: string) {
  if (item.status !== "open") {
    return (
      <StatusBadge tone={item.status === "done" ? "success" : "neutral"}>
        {COMPLIANCE_STATUS_LABELS[item.status]}
      </StatusBadge>
    );
  }
  const days = daysBetween(today, item.dueOn);
  if (days < 0) {
    return <StatusBadge tone="danger">Overdue</StatusBadge>;
  }
  if (days <= 7) {
    return (
      <StatusBadge tone="warning">
        {days === 0 ? "Due today" : `Due in ${days} days`}
      </StatusBadge>
    );
  }
  return <StatusBadge tone="info">Open</StatusBadge>;
}

function useOwners(canManage: boolean) {
  const load = useServerFn(getTrusteeAccountOptions);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!canManage) {
      return;
    }
    load()
      .then((rows) => setOwners(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => undefined);
  }, [canManage, load]);
  return owners;
}

function CompliancePage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const zero = useZero();
  const [rows, result] = useQuery(queries.compliance.items());
  const [templates] = useQuery(queries.compliance.templates());
  const { documents } = useGovernanceDocuments();
  const owners = useOwners(canManage);
  const ownerName = (id: string | null) =>
    id ? (owners.find((o) => o.id === id)?.name ?? "Assigned") : "Secretaries";
  const [filter, setFilter] = useState<Filter>("open");
  const [dialog, setDialog] = useState<Dialogs>(null);
  const today = todayIso();
  const isLoading = rows.length === 0 && result.type !== "complete";

  const items: Item[] = rows.map((r) => ({
    dueOn: epochToIso(r.dueOn),
    evidenceDocumentId: r.evidenceDocumentId ?? null,
    id: r.id,
    note: r.note ?? null,
    ownerUserId: r.ownerUserId ?? null,
    status: r.status ?? "open",
    title: r.title,
  }));
  const shown = items.filter((i) =>
    filter === "all"
      ? true
      : filter === "open"
        ? i.status === "open"
        : i.status !== "open"
  );
  const months = new Map<string, Item[]>();
  for (const item of shown) {
    const key = item.dueOn.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  const overdue = items.filter(
    (i) => i.status === "open" && i.dueOn < today
  ).length;

  const mutate = useEventCallback(
    async (
      pending: Promise<{ error?: unknown; type: string }>,
      entityId: string,
      mutation: string,
      success: string
    ) => {
      const out = await pending;
      handleMutationResult(out, {
        entityId,
        errorMsg: `Couldn't save: ${getMutationResultErrorMessage(out.type === "error" ? out.error : undefined, "something went wrong")}`,
        mutation,
        successMsg: success,
      });
      if (out.type !== "error") {
        setDialog(null);
      }
    }
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <>
              <Button onClick={() => setDialog({ kind: "add" })} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add item
              </Button>
              <PageHeaderMenu
                actions={[
                  {
                    icon: CalendarSetting01Icon,
                    id: "templates",
                    label: "Recurring items",
                    onSelect: () => setDialog({ kind: "templates" }),
                  },
                ]}
                title="Calendar actions"
              />
            </>
          ) : null
        }
        description="Filings, renewals and Board approvals that fall due each year. An item closes only with the filing or record that proves it, from the Documents vault."
        title="Compliance calendar"
      />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["open", "closed", "all"] as const).map((value) => (
          <Button
            aria-pressed={filter === value}
            key={value}
            onClick={() => setFilter(value)}
            size="sm"
            type="button"
            variant={filter === value ? "secondary" : "ghost"}
          >
            {{ all: "All", closed: "Closed", open: "Open" }[value]}
          </Button>
        ))}
        {overdue > 0 ? (
          <StatusBadge tone="danger">{overdue} overdue</StatusBadge>
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-6">
        {isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {!isLoading && shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing here.</p>
        ) : null}
        {[...months.entries()].map(([month, monthItems]) => (
          <section
            aria-label={month}
            className="flex flex-col gap-2"
            key={month}
          >
            <h2 className="text-sm font-semibold">
              {format(isoToDate(`${month}-01`) ?? new Date(), "MMMM yyyy")}
            </h2>
            <div className="divide-y rounded-md border">
              {monthItems.map((item) => (
                <div
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                  data-testid={`compliance-item-${item.id}`}
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-xs">
                      Due {formatIso(item.dueOn)} ·{" "}
                      {ownerName(item.ownerUserId)}
                      {item.note ? ` · ${item.note}` : ""}
                    </p>
                  </div>
                  {item.evidenceDocumentId ? (
                    <EvidenceLink
                      documentId={item.evidenceDocumentId}
                      documents={documents}
                    />
                  ) : null}
                  {dueBadge(item, today)}
                  {canManage ? (
                    <ResponsiveActionMenu
                      actions={[
                        item.status === "open" && {
                          icon: CheckmarkCircle02Icon,
                          id: "close",
                          label: "Mark done",
                          onSelect: () => setDialog({ item, kind: "close" }),
                        },
                        item.status === "open" && {
                          icon: UserAccountIcon,
                          id: "assign",
                          label: "Assign",
                          onSelect: () => setDialog({ item, kind: "assign" }),
                        },
                        item.status !== "open" && {
                          icon: Undo02Icon,
                          id: "reopen",
                          label: "Reopen",
                          onSelect: () =>
                            mutate(
                              zero.mutate(
                                mutators.complianceItem.reopen({ id: item.id })
                              ).server,
                              item.id,
                              "complianceItem.reopen",
                              "Reopened"
                            ),
                        },
                        item.status === "open" && {
                          destructive: true,
                          icon: Delete02Icon,
                          id: "waive",
                          label: "Not needed",
                          onSelect: () => setDialog({ item, kind: "waive" }),
                        },
                      ]}
                      title={`${item.title} actions`}
                      trigger={<RowActionsButton />}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <CloseDialog
        dialog={dialog}
        documents={documents}
        onClose={() => setDialog(null)}
        onSubmit={(item, documentId, note) =>
          mutate(
            zero.mutate(
              mutators.complianceItem.close({
                evidenceDocumentId: documentId,
                id: item.id,
                note: note || null,
              })
            ).server,
            item.id,
            "complianceItem.close",
            "Marked done"
          )
        }
      />
      <TextDialog
        description="Say why it isn't needed this time; it stays on the calendar as closed."
        label="Reason"
        onClose={() => setDialog(null)}
        onSubmit={(text) =>
          dialog?.kind === "waive"
            ? mutate(
                zero.mutate(
                  mutators.complianceItem.waive({
                    id: dialog.item.id,
                    note: text,
                  })
                ).server,
                dialog.item.id,
                "complianceItem.waive",
                "Marked not needed"
              )
            : undefined
        }
        open={dialog?.kind === "waive"}
        submitLabel="Not needed"
        title="Not needed this time"
      />
      <AssignDialog
        item={dialog?.kind === "assign" ? dialog.item : null}
        onClose={() => setDialog(null)}
        onSubmit={(item, ownerUserId) =>
          mutate(
            zero.mutate(
              mutators.complianceItem.assign({ id: item.id, ownerUserId })
            ).server,
            item.id,
            "complianceItem.assign",
            "Assigned"
          )
        }
        owners={owners}
      />
      <AddDialog
        onClose={() => setDialog(null)}
        onSubmit={(title, dueOn) => {
          const id = uuidv7();
          return mutate(
            zero.mutate(mutators.complianceItem.create({ dueOn, id, title }))
              .server,
            id,
            "complianceItem.create",
            "Item added"
          );
        }}
        open={dialog?.kind === "add"}
      />
      <Dialog
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog?.kind === "templates"}
      >
        <DialogContent className="sm:max-w-(--dialog-lg)">
          <DialogHeader>
            <DialogTitle>Recurring items</DialogTitle>
            <DialogDescription>
              Turn an item off if it doesn't apply, and choose who it goes to.
              New occurrences are added every night.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col divide-y">
            {templates.map((template) => (
              <div
                className="flex flex-wrap items-center gap-3 py-3"
                key={template.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{template.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {template.description}
                  </p>
                </div>
                <PlainSelect
                  className="w-48"
                  label={`Owner of ${template.title}`}
                  onChange={(next) =>
                    mutate(
                      zero.mutate(
                        mutators.complianceTemplate.update({
                          active: template.active ?? true,
                          id: template.id,
                          ownerUserId: next || null,
                        })
                      ).server,
                      template.id,
                      "complianceTemplate.update",
                      "Saved"
                    )
                  }
                  options={[
                    { label: "Secretaries", value: "" },
                    ...owners.map((o) => ({ label: o.name, value: o.id })),
                  ]}
                  value={template.ownerUserId ?? ""}
                />
                <Switch
                  aria-label={`${template.title} on`}
                  checked={template.active ?? true}
                  onCheckedChange={(active) =>
                    mutate(
                      zero.mutate(
                        mutators.complianceTemplate.update({
                          active,
                          id: template.id,
                          ownerUserId: template.ownerUserId ?? null,
                        })
                      ).server,
                      template.id,
                      "complianceTemplate.update",
                      active ? "Turned on" : "Turned off"
                    )
                  }
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CloseDialog({
  dialog,
  documents,
  onClose,
  onSubmit,
}: {
  dialog: Dialogs;
  documents: ReturnType<typeof useGovernanceDocuments>["documents"];
  onClose: () => void;
  onSubmit: (item: Item, documentId: string, note: string) => void;
}) {
  const [documentId, setDocumentId] = useState(NO_DOCUMENT);
  const [note, setNote] = useState("");
  const item = dialog?.kind === "close" ? dialog.item : null;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setDocumentId(NO_DOCUMENT);
          setNote("");
        }
      }}
      open={item !== null}
    >
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Mark done</DialogTitle>
          <DialogDescription>{item?.title}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compliance-evidence">Evidence</Label>
          <PlainSelect
            id="compliance-evidence"
            onChange={setDocumentId}
            options={[
              { label: "Choose a document…", value: NO_DOCUMENT },
              ...documents.map((d) => ({
                label: `${d.title} · ${formatIso(d.datedOn)}`,
                value: d.id,
              })),
            ]}
            value={documentId}
          />
          <p className="text-muted-foreground text-xs">
            The acknowledgement, filing or signed record.{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/governance/documents"
            >
              Add it to the vault
            </Link>{" "}
            first if it isn't there.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compliance-note">Note</Label>
          <Textarea
            id="compliance-note"
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            value={note}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={documentId === NO_DOCUMENT}
            onClick={() => item && onSubmit(item, documentId, note)}
            type="button"
          >
            Mark done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TextDialog({
  description,
  label,
  onClose,
  onSubmit,
  open,
  submitLabel,
  title,
}: {
  description: string;
  label: string;
  onClose: () => void;
  onSubmit: (text: string) => void;
  open: boolean;
  submitLabel: string;
  title: string;
}) {
  const [text, setText] = useState("");
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setText("");
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compliance-text">{label}</Label>
          <Textarea
            id="compliance-text"
            onChange={(e) => setText(e.target.value)}
            rows={3}
            value={text}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!text.trim()}
            onClick={() => onSubmit(text.trim())}
            type="button"
          >
            {submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  item,
  onClose,
  onSubmit,
  owners,
}: {
  item: Item | null;
  onClose: () => void;
  onSubmit: (item: Item, ownerUserId: string | null) => void;
  owners: { id: string; name: string }[];
}) {
  const [owner, setOwner] = useState("");
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={item !== null}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Assign</DialogTitle>
          <DialogDescription>{item?.title}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compliance-owner">Owner</Label>
          <PlainSelect
            id="compliance-owner"
            onChange={setOwner}
            options={[
              {
                label: "Secretaries (everyone who manages governance)",
                value: "",
              },
              ...owners.map((o) => ({ label: o.name, value: o.id })),
            ]}
            value={owner}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            onClick={() => item && onSubmit(item, owner || null)}
            type="button"
          >
            Assign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({
  onClose,
  onSubmit,
  open,
}: {
  onClose: () => void;
  onSubmit: (title: string, dueOn: string) => void;
  open: boolean;
}) {
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onClose();
          setTitle("");
          setDueOn("");
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Add an item</DialogTitle>
          <DialogDescription>
            A one-off deadline outside the recurring items.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compliance-title">Title</Label>
          <Input
            id="compliance-title"
            onChange={(e) => setTitle(e.target.value)}
            value={title}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compliance-due">Due on</Label>
          <Input
            id="compliance-due"
            onChange={(e) => setDueOn(e.target.value)}
            type="date"
            value={dueOn}
          />
        </div>
        <div className={cn("flex justify-end gap-2")}>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!(title.trim() && dueOn)}
            onClick={() => onSubmit(title.trim(), dueOn)}
            type="button"
          >
            Add item
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
