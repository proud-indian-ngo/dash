import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { createKalakritiCredentialTokenHash } from "@pi-dash/shared/kalakriti-credential";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { type ChangeEvent, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import {
  CredentialsTable,
  type KalakritiCredentialRow,
} from "@/components/kalakriti/credentials-table";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { canManageKalakritiCredentials } from "@/lib/kalakriti-credential-policy";

export const Route = createFileRoute("/_app/kalakriti/$year/credentials")({
  beforeLoad: ({ context }) => {
    if (!canManageKalakritiCredentials(context.kalakritiEditionAccess)) {
      throw notFound();
    }
  },
  component: KalakritiCredentialsPage,
});

function KalakritiCredentialsPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const { year } = edition;
  const [lookupId, setLookupId] = useState("");
  const [lookupResult, setLookupResult] = useState<null | {
    humanId: string;
    issuedAt: number;
    kind: "student" | "volunteer";
    name: string;
    scopeLabel: string;
  }>(null);
  const [credentials, credentialsResult] = useQuery(
    queries.kalakritiCredential.visibleForAdmin({ editionId: edition.id })
  );
  const isLoading =
    credentials.length === 0 && credentialsResult.type !== "complete";

  const printCredentials = useEventCallback(
    async (rows: readonly KalakritiCredentialRow[]) => {
      const activeRows = rows.filter((row) => row.revokedAt === null);
      if (activeRows.length === 0) {
        toast.error("Select at least one active credential to print");
        return { error: { message: "No active rows" }, type: "error" as const };
      }
      const response = await fetch(`/api/kalakriti/${year}/credentials/print`, {
        body: JSON.stringify({
          subjects: activeRows.map((row) => ({
            membershipId: row.membershipId ?? undefined,
            studentId: row.studentId ?? undefined,
          })),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        toast.error("Failed to print credentials");
        return {
          error: { message: "Failed to print credentials" },
          type: "error" as const,
        };
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kalakriti-${year}-credentials.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Credential cards downloaded");
      return { type: "success" as const };
    }
  );

  const printAction = useConfirmAction<readonly KalakritiCredentialRow[]>({
    onConfirm: printCredentials,
  });

  const reissueAction = useConfirmAction<KalakritiCredentialRow>({
    mutationMeta: {
      entityId: (row) => row.id,
      errorMsg: "Failed to reissue credential",
      mutation: "kalakritiCredential.reissue",
      successMsg: "Credential reissued",
    },
    onConfirm: async (row) => {
      const auditEntryId = uuidv7();
      return zero.mutate(
        mutators.kalakritiCredential.reissue({
          auditEntryId,
          credentialId: uuidv7(),
          editionId: edition.id,
          membershipId: row.membershipId ?? undefined,
          now: Date.now(),
          studentId: row.studentId ?? undefined,
          tokenHash: await createKalakritiCredentialTokenHash(),
        })
      ).server;
    },
  });

  const handleLookup = useEventCallback(async () => {
    const trimmed = lookupId.trim();
    if (!trimmed) {
      setLookupResult(null);
      return;
    }
    const response = await fetch(
      `/api/kalakriti/${year}/credentials/lookup?humanId=${encodeURIComponent(trimmed)}`
    );
    if (!response.ok) {
      setLookupResult(null);
      toast.error("Credential not found in this Edition");
      return;
    }
    setLookupResult(await response.json());
  });

  const handleLookupIdChange = useEventCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setLookupId(event.target.value);
    }
  );
  const handlePrintRows = useEventCallback((rows: KalakritiCredentialRow[]) => {
    printAction.trigger(rows);
  });
  const handleReissueRow = useEventCallback((row: KalakritiCredentialRow) => {
    reissueAction.trigger(row);
  });
  const handlePrintDialogOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      printAction.cancel();
    }
  });
  const handleReissueDialogOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      reissueAction.cancel();
    }
  });

  return (
    <div className="space-y-6">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        meta={
          <p className="max-w-2xl text-muted-foreground text-sm">
            Look up yearly IDs and print credential cards for Students and
            volunteers. Printing always issues a new QR; previous cards stop
            working.
          </p>
        }
        title="Credentials"
      />
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="font-medium text-sm" htmlFor="credential-lookup">
            Lookup yearly ID
          </label>
          <Input
            id="credential-lookup"
            onChange={handleLookupIdChange}
            placeholder="KAL-2027-0012 or KALV-2027-0003"
            value={lookupId}
          />
        </div>
        <Button onClick={handleLookup} type="button">
          Look up
        </Button>
      </div>
      {lookupResult ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p>
            <span className="font-medium">{lookupResult.name}</span> (
            {lookupResult.kind === "student" ? "Student" : "Volunteer"})
          </p>
          <p className="font-mono">{lookupResult.humanId}</p>
          <p>{lookupResult.scopeLabel}</p>
        </div>
      ) : null}
      <CredentialsTable
        data={credentials as KalakritiCredentialRow[]}
        isLoading={isLoading}
        onPrint={handlePrintRows}
        onReissue={handleReissueRow}
      />
      <ConfirmDialog
        confirmLabel="Print cards"
        description="Printing issues a new QR for each selected person. Any previously printed cards for them will stop working."
        loading={printAction.isLoading}
        loadingLabel="Printing..."
        onConfirm={printAction.confirm}
        onOpenChange={handlePrintDialogOpenChange}
        open={printAction.isOpen}
        title="Print credential cards?"
      />
      <ConfirmDialog
        confirmLabel="Reissue"
        description="Reissuing creates a new QR code. Any previously printed cards for this person will stop working."
        loading={reissueAction.isLoading}
        loadingLabel="Reissuing..."
        onConfirm={reissueAction.confirm}
        onOpenChange={handleReissueDialogOpenChange}
        open={reissueAction.isOpen}
        title="Reissue credential?"
      />
    </div>
  );
}
