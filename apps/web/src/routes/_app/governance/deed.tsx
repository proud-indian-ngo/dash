import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { env } from "@pi-dash/env/web";
import {
  type DeedRules,
  GOVERNANCE_PAGE_PERMISSIONS,
  RESOLUTION_THRESHOLD_LABELS,
  TRUSTEE_OFFICE_LABELS,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import {
  type DocumentOption,
  governanceDocumentHref,
} from "@/components/governance/evidence";
import {
  type DeedVersionView,
  formatIso,
  todayIso,
  useGovernanceDocuments,
  useRegister,
} from "@/components/governance/register-data";
import { PageHeader } from "@/components/shared/page-header";
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

function quorumText(rules: DeedRules): string {
  const office = rules.quorumRequiredOffice
    ? `, including the ${TRUSTEE_OFFICE_LABELS[rules.quorumRequiredOffice]}`
    : "";
  if (rules.quorumKind === "fixed") {
    return `${rules.quorumValue} trustees present and voting${office}`;
  }
  return `${rules.quorumValue}% of the trustees in office, never fewer than ${rules.quorumFloor}${office}`;
}

function castingText(rules: DeedRules): string {
  if (rules.castingVote === "chair") {
    return "The chair of the meeting";
  }
  if (rules.castingVote === "co_founders") {
    return "The Co-Founders";
  }
  return "None";
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

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
  const link = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const documentId = event.target.value || null;
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
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground text-xs">Registered copy</span>
      <select
        aria-label={`Registered copy of version ${version.number}`}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        onChange={link}
        value={version.documentId ?? ""}
      >
        <option value="">Not linked</option>
        {deeds.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title} · {formatIso(d.datedOn)}
          </option>
        ))}
      </select>
    </label>
  );
}

function VersionCard({
  canManage,
  documents,
  inForce,
  version,
}: {
  canManage: boolean;
  documents: readonly DocumentOption[];
  inForce: boolean;
  version: DeedVersionView;
}) {
  const { rules } = version;
  return (
    <section className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">
            Version {version.number}: {version.title}
          </h2>
          <span className="text-muted-foreground text-sm">
            In force from {formatIso(version.effectiveFrom)}
          </span>
        </div>
        <span className="flex items-center gap-2">
          {inForce ? <Badge variant="secondary">In force today</Badge> : null}
          {version.documentId ? (
            <a
              className="text-primary text-sm underline-offset-4 hover:underline"
              href={governanceDocumentHref(version.documentId)}
              rel="noreferrer"
              target="_blank"
            >
              {version.documentTitle ?? "Registered document"}
            </a>
          ) : (
            <Badge className="text-warning-foreground" variant="outline">
              Registered copy not in the vault
            </Badge>
          )}
        </span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Rule
          label="Board size"
          value={`${rules.minTrustees} to ${rules.maxTrustees} trustees`}
        />
        <Rule label="Quorum at meetings" value={quorumText(rules)} />
        <Rule label="Casting vote" value={castingText(rules)} />
        <Rule
          label="Meeting notice"
          value={`At least ${rules.noticeDays} days, with an agenda`}
        />
        <Rule
          label="Circulars issued by"
          value={rules.circularIssuers
            .map((office) => TRUSTEE_OFFICE_LABELS[office])
            .join(", then ")}
        />
        <Rule
          label="Circulation by email and electronic signatures"
          value={rules.electronicCirculation ? "Allowed" : "Not provided for"}
        />
        <Rule
          label="Video attendance counts as present"
          value={rules.videoCountsPresent ? "Yes" : "Not provided for"}
        />
        <Rule
          label="Co-option"
          value={`Up to ${rules.coOptionMaxYears} years at a time`}
        />
        <Rule
          label="Amending the deed"
          value={`${RESOLUTION_THRESHOLD_LABELS[rules.amendmentThreshold]}, with the Income-tax Commissioner's prior approval`}
        />
      </dl>
      {canManage ? (
        <div className="max-w-md">
          <LinkDeed documents={documents} version={version} />
        </div>
      ) : null}
    </section>
  );
}

function DeedPage() {
  const today = todayIso();
  const { deedVersions, inForce } = useRegister(today);
  const { documents } = useGovernanceDocuments();
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        description="The rules pi-dash checks the register, resolutions and meetings against. A registered deed of amendment adds a version; earlier decisions keep the rules of their date."
        title="Trust deed"
      />
      <div className="mt-6 flex flex-col gap-4">
        {deedVersions.map((version) => (
          <VersionCard
            canManage={canManage}
            documents={documents}
            inForce={inForce?.id === version.id}
            key={version.id}
            version={version}
          />
        ))}
      </div>
    </div>
  );
}
