import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { env } from "@pi-dash/env/web";
import {
  DEED_VERSION_1,
  deedVersionOn,
  GOVERNANCE_PAGE_PERMISSIONS,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { deedRuleLines } from "@/components/governance/deed-rules";
import { DeedVersionDialog } from "@/components/governance/deed-version-dialog";
import {
  type DocumentOption,
  governanceDocumentHref,
} from "@/components/governance/evidence";
import { PlainSelect } from "@/components/governance/plain-select";
import {
  type DeedVersionView,
  formatIso,
  todayIso,
  useGovernanceDocuments,
  toDeedVersionView,
} from "@/components/governance/register-data";
import { FilePreviewButton } from "@/components/shared/file-preview";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge, Tag } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/deed")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...GOVERNANCE_PAGE_PERMISSIONS),
  component: DeedPage,
  head: () => ({
    meta: [{ title: `Trust deed | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.deedVersion.all(),
      abortController.signal
    );
  },
});

function LinkDeed({
  documents,
  version,
}: {
  documents: readonly DocumentOption[];
  version: DeedVersionView;
}) {
  const zero = useZero();
  const deeds = documents.filter(
    (d) => d.kind === "trust_deed" || d.kind === "deed_amendment"
  );
  const link = async (value: string) => {
    const documentId = value || null;
    const result = await zero.mutate(
      mutators.deedVersion.linkDocument({ documentId, id: version.id })
    ).server;
    handleMutationResult(result, {
      entityId: version.id,
      errorMsg: `Couldn't link the document: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "deedVersion.linkDocument",
      successMsg: documentId ? "Registered copy linked" : "Link removed",
    });
  };
  if (deeds.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add the registered deed on the Documents page to link it here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground text-xs">Registered copy</span>
      <PlainSelect
        label={`Registered copy of version ${version.number}`}
        onChange={link}
        options={[
          { label: "Not linked", value: "" },
          ...deeds.map((d) => ({
            label: `${d.title} · ${formatIso(d.datedOn)}`,
            value: d.id,
          })),
        ]}
        value={version.documentId ?? ""}
      />
    </div>
  );
}

function RegisteredCopy({ version }: { version: DeedVersionView }) {
  if (!version.documentId) {
    return (
      <StatusBadge tone="warning">Registered copy not in the vault</StatusBadge>
    );
  }
  return (
    <FilePreviewButton
      className="text-primary inline-flex items-center text-sm underline-offset-4 hover:underline pointer-coarse:min-h-10"
      src={governanceDocumentHref(version.documentId)}
      fileName={version.documentTitle ?? "Registered document"}
    >
      {version.documentTitle ?? "Registered document"}
    </FilePreviewButton>
  );
}

/** The rules of the version in force today, in full. */
function RulesInForce({ version }: { version: DeedVersionView }) {
  return (
    <section
      aria-labelledby="rules-in-force"
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold" id="rules-in-force">
            Rules in force
          </h2>
          <span className="text-muted-foreground text-sm">
            Version {version.number}: {version.title}, from{" "}
            {formatIso(version.effectiveFrom)}
          </span>
        </div>
        <StatusBadge tone="success">In force today</StatusBadge>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {deedRuleLines(version.rules).map((line) => (
          <div className="flex flex-col gap-0.5" key={line.label}>
            <dt className="text-muted-foreground text-xs">{line.label}</dt>
            <dd className="text-sm">{line.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DeedLoadingSkeleton() {
  const rules = deedRuleLines(DEED_VERSION_1.rules);

  return (
    <>
      <section
        aria-hidden="true"
        className="flex flex-col gap-4 rounded-lg border p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col">
            <h2 className="text-base font-semibold">Rules in force</h2>
            <div className="flex flex-col gap-0.5 sm:hidden">
              <Skeleton className="h-5 w-72 max-w-full" />
              <Skeleton className="h-5 w-56" />
            </div>
            <Skeleton className="hidden h-5 w-96 max-w-full sm:block" />
          </div>
          <Skeleton className="h-5.5 w-24" />
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((line) => (
            <div className="flex flex-col gap-0.5" key={line.label}>
              <dt className="text-muted-foreground text-xs">{line.label}</dt>
              <dd>
                <Skeleton className="h-5 w-32" />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-hidden="true" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">History</h2>
        <ul className="divide-y rounded-lg border">
          <li className="flex flex-col gap-3 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col">
                <Skeleton className="h-5 w-64 max-w-full" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-5.5 w-16" />
            </div>
          </li>
        </ul>
      </section>
    </>
  );
}

/** One version in the history: what it changed from the version before. */
function HistoryEntry({
  canManage,
  documents,
  isInForce,
  previous,
  today,
  version,
}: {
  canManage: boolean;
  documents: readonly DocumentOption[];
  isInForce: boolean;
  previous: DeedVersionView | null;
  today: string;
  version: DeedVersionView;
}) {
  const before = previous ? deedRuleLines(previous.rules) : [];
  const changes = previous
    ? deedRuleLines(version.rules).filter(
        (line, i) => line.value !== before[i]?.value
      )
    : [];
  let summary = "Original deed";
  if (previous) {
    summary = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  }
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="text-sm font-medium">
            Version {version.number}: {version.title}
          </h3>
          <span className="text-muted-foreground text-xs">
            From {formatIso(version.effectiveFrom)} · {summary}
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {isInForce ? (
            <StatusBadge tone="success">In force</StatusBadge>
          ) : null}
          {version.effectiveFrom > today ? (
            <StatusBadge tone="info">Not yet in force</StatusBadge>
          ) : null}
          {previous ? null : <Tag>Original</Tag>}
          <RegisteredCopy version={version} />
        </span>
      </div>
      {changes.length > 0 ? (
        <dl className="flex flex-col gap-2">
          {changes.map((line) => (
            <div className="flex flex-col gap-0.5" key={line.label}>
              <dt className="text-muted-foreground text-xs">{line.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <del className="text-muted-foreground">
                  {before.find((b) => b.label === line.label)?.value}
                </del>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                <ins className="no-underline">{line.value}</ins>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {canManage ? (
        <div className="max-w-md">
          <LinkDeed documents={documents} version={version} />
        </div>
      ) : null}
    </li>
  );
}

function DeedPage() {
  const today = todayIso();
  const [deedRows, deedResult] = useQuery(queries.deedVersion.all());
  const deedVersions = deedRows.map(toDeedVersionView);
  const inForce = deedVersionOn(deedVersions, today);
  const isLoading = deedRows.length === 0 && deedResult.type !== "complete";
  const { documents } = useGovernanceDocuments();
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const [adding, setAdding] = useState(false);
  const latest = deedVersions.at(-1);
  const newestFirst = deedVersions
    .map((version, i) => ({ previous: deedVersions[i - 1] ?? null, version }))
    .reverse();
  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <Button
              disabled={isLoading || !latest}
              onClick={() => setAdding(true)}
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add a version
            </Button>
          ) : null
        }
        description="The rules the dashboard checks the register, resolutions and meetings against. A registered deed of amendment adds a version; earlier decisions keep the rules of their date."
        title="Trust deed"
      />
      <div className="mt-6 flex flex-col gap-6">
        {isLoading ? (
          <>
            <span className="sr-only" role="status">
              Loading deed
            </span>
            <DeedLoadingSkeleton />
          </>
        ) : (
          <>
            {inForce ? <RulesInForce version={inForce} /> : null}
            <section
              aria-labelledby="deed-history"
              className="flex flex-col gap-2"
            >
              <h2 className="text-base font-semibold" id="deed-history">
                History
              </h2>
              <ul className="divide-y rounded-lg border">
                {newestFirst.map(({ previous, version }) => (
                  <HistoryEntry
                    canManage={canManage}
                    documents={documents}
                    isInForce={inForce?.id === version.id}
                    key={version.id}
                    previous={previous}
                    today={today}
                    version={version}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
      {latest ? (
        <DeedVersionDialog
          documents={documents}
          latest={latest.rules}
          onOpenChange={setAdding}
          open={adding}
        />
      ) : null}
    </div>
  );
}
