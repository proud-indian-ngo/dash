import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { createKalakritiCredentialTokenHash } from "@pi-dash/shared/kalakriti-credential";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { format } from "date-fns";
import { log } from "evlog";
import { type ChangeEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import {
  CredentialsTable,
  type KalakritiCredentialRow,
} from "@/components/kalakriti/credentials-table";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getKalakritiCredentialsForAdmin } from "@/functions/kalakriti-credentials";
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
  const [credentials, setCredentials] = useState<KalakritiCredentialRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadCredentials = useEventCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const rows = await getKalakritiCredentialsForAdmin({ data: { year } });
      setCredentials(rows ?? []);
    } catch (error) {
      log.error({
        action: "loadCredentials",
        component: "KalakritiCredentialsPage",
        editionId: edition.id,
        error: error instanceof Error ? error.message : String(error),
        year,
      });
      setLoadError(true);
      toast.error("Couldn't load credentials");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError(false);
      try {
        const rows = await getKalakritiCredentialsForAdmin({ data: { year } });
        if (!cancelled) {
          setCredentials(rows ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          log.error({
            action: "loadCredentials",
            component: "KalakritiCredentialsPage",
            editionId: edition.id,
            error: error instanceof Error ? error.message : String(error),
            year,
          });
          setLoadError(true);
          toast.error("Couldn't load credentials");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [edition.id, year]);

  const printCredentials = useEventCallback(
    async (rows: readonly KalakritiCredentialRow[]) => {
      const activeRows = rows.filter((row) => row.revokedAt === null);
      if (activeRows.length === 0) {
        toast.error("Select at least one active credential to print");
        return { error: { message: "No active rows" }, type: "error" as const };
      }
      try {
        const response = await fetch(
          `/api/kalakriti/${year}/credentials/print`,
          {
            body: JSON.stringify({
              subjects: activeRows.map((row) => ({
                membershipId: row.membershipId ?? undefined,
                studentId: row.studentId ?? undefined,
              })),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        if (!response.ok) {
          throw new Error(`Credential print failed: ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        try {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `kalakriti-${year}-credentials.pdf`;
          anchor.click();
        } finally {
          URL.revokeObjectURL(url);
        }
        toast.success("Credential cards downloaded");
        await loadCredentials();
        return { type: "success" as const };
      } catch (error) {
        log.error({
          action: "printCredentials",
          component: "KalakritiCredentialsPage",
          credentialCount: activeRows.length,
          editionId: edition.id,
          error: error instanceof Error ? error.message : String(error),
          year,
        });
        toast.error("Failed to print credentials");
        return {
          error: { message: "Failed to print credentials" },
          type: "error" as const,
        };
      }
    }
  );

  const printAction = useConfirmAction<readonly KalakritiCredentialRow[]>({
    onConfirm: printCredentials,
  });

  const reissueAction = useConfirmAction<KalakritiCredentialRow>({
    mutationMeta: {
      entityId: (row) => row.id,
      errorMsg: "Failed to issue credential QR",
      mutation: "kalakritiCredential.reissue",
      successMsg: "Credential QR issued",
    },
    onConfirm: async (row) => {
      const auditEntryId = uuidv7();
      const result = await zero.mutate(
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
      await loadCredentials();
      return result;
    },
  });

  const handleLookup = useEventCallback(async () => {
    const trimmed = lookupId.trim();
    if (!trimmed) {
      setLookupResult(null);
      return;
    }
    let responseStatus: number | undefined;
    try {
      const response = await fetch(
        `/api/kalakriti/${year}/credentials/lookup?humanId=${encodeURIComponent(trimmed)}`
      );
      responseStatus = response.status;
      if (response.status === 404) {
        setLookupResult(null);
        toast.error("Credential not found in this Edition");
        return;
      }
      if (!response.ok) {
        throw new Error(`Credential lookup failed: ${response.status}`);
      }
      setLookupResult(await response.json());
    } catch (error) {
      log.error({
        action: "lookupCredential",
        component: "KalakritiCredentialsPage",
        editionId: edition.id,
        error: error instanceof Error ? error.message : String(error),
        humanId: trimmed,
        responseStatus,
        year,
      });
      setLookupResult(null);
      toast.error(
        responseStatus === 401 || responseStatus === 403
          ? "You no longer have access to look up credentials"
          : "Couldn't look up credential. Check your connection and try again."
      );
    }
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
          <p className="text-muted-foreground max-w-2xl text-sm">
            Look up yearly IDs and print credential cards for Students and
            volunteers. Printing always issues a new QR; previous cards stop
            working.
          </p>
        }
        title="Credentials"
      />
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium" htmlFor="credential-lookup">
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
        <div className="bg-muted/30 rounded-lg border p-4 text-sm">
          <p>
            <span className="font-medium">{lookupResult.name}</span> (
            {lookupResult.kind === "student" ? "Student" : "Volunteer"})
          </p>
          <p className="font-mono">{lookupResult.humanId}</p>
          <p>{lookupResult.scopeLabel}</p>
          <p>Issued {format(lookupResult.issuedAt, "dd MMM yyyy, HH:mm")}</p>
        </div>
      ) : null}
      {loadError ? (
        <div
          className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-md border p-4"
          role="alert"
        >
          <div>
            <p className="font-medium">Couldn't load credentials</p>
            <p className="text-muted-foreground text-sm">
              Check your connection and try again.
            </p>
          </div>
          <Button onClick={loadCredentials} size="sm" variant="outline">
            Retry
          </Button>
        </div>
      ) : null}
      {credentials.length > 0 || !loadError ? (
        <CredentialsTable
          data={credentials}
          isLoading={isLoading}
          onPrint={handlePrintRows}
          onReissue={handleReissueRow}
        />
      ) : null}
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
        confirmLabel={
          reissueAction.payload?.issuedAt === null ? "Issue QR" : "Reissue"
        }
        description={
          reissueAction.payload?.issuedAt === null
            ? "Issuing creates a new QR code for this person."
            : "Reissuing creates a new QR code. Any previously printed cards for this person will stop working."
        }
        loading={reissueAction.isLoading}
        loadingLabel={
          reissueAction.payload?.issuedAt === null
            ? "Issuing..."
            : "Reissuing..."
        }
        onConfirm={reissueAction.confirm}
        onOpenChange={handleReissueDialogOpenChange}
        open={reissueAction.isOpen}
        title={
          reissueAction.payload?.issuedAt === null
            ? "Issue credential?"
            : "Reissue credential?"
        }
      />
    </div>
  );
}
