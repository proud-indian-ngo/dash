import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import {
  POLICY_AUDIENCE_LABELS,
  type PolicyAudience,
  policyVersionOn,
} from "@pi-dash/shared/declarations";
import {
  boardOn,
  GOVERNANCE_PAGE_PERMISSIONS,
} from "@pi-dash/shared/governance";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import {
  NewPolicyDialog,
  PublishDialog,
} from "@/components/governance/policy-dialogs";
import {
  epochToIso,
  formatIso,
  todayIso,
  useGovernanceDocuments,
  useRegister,
} from "@/components/governance/register-data";
import { useAccountOptions } from "@/components/governance/use-account-options";
import { FilePreviewButton } from "@/components/shared/file-preview";
import { PageHeader } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/governance/policies")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...GOVERNANCE_PAGE_PERMISSIONS),
  component: PoliciesPage,
  head: () => ({
    meta: [{ title: `Policies | ${env.VITE_APP_NAME}` }],
  }),
});

function PoliciesPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const [policies] = useQuery(queries.policy.all());
  const [acknowledgements] = useQuery(queries.policy.acknowledgements());
  const { documents } = useGovernanceDocuments();
  const today = todayIso();
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const ackedBy = new Map<string, Set<string>>();
  for (const a of acknowledgements) {
    ackedBy.set(
      a.policyVersionId,
      (ackedBy.get(a.policyVersionId) ?? new Set()).add(a.userId)
    );
  }
  // Who each policy is for, so the secretary sees who still has to read it.
  const accounts = useAccountOptions(canManage);
  const { input } = useRegister(today);
  const audiences: Record<PolicyAudience, { id: string; name: string }[]> = {
    everyone: accounts,
    trustees: boardOn(input, today).flatMap(({ trustee }) =>
      trustee.userId ? [{ id: trustee.userId, name: trustee.legalName }] : []
    ),
  };
  const [outstanding, setOutstanding] = useState<{
    names: string[];
    title: string;
  } | null>(null);

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              New policy
            </Button>
          ) : null
        }
        description="The trust's policies, each with its approved versions and who has acknowledged them. Everyone the policy is for accepts the version in force before they can use the dashboard; the child-safeguarding policy must be acknowledged before joining events with children."
        title="Policies"
      />
      <div className="mt-6 flex flex-col gap-4">
        {policies.map((p) => {
          const versions = (p.versions ?? []).map((v) => ({
            ...v,
            effectiveOn: epochToIso(v.effectiveOn),
          }));
          const inForce = policyVersionOn(versions, today);
          return (
            <section
              aria-label={p.title}
              className="flex flex-col gap-3 rounded-md border p-4"
              key={p.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col">
                  <h2 className="text-base font-semibold">{p.title}</h2>
                  <span className="text-muted-foreground text-sm">
                    For{" "}
                    {POLICY_AUDIENCE_LABELS[
                      p.audience ?? "everyone"
                    ].toLowerCase()}
                    {p.gatesChildren
                      ? " · needed before events with children"
                      : ""}
                  </span>
                </div>
                {canManage ? (
                  <Button
                    onClick={() => setPublishing(p.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Publish a version
                  </Button>
                ) : null}
              </div>
              {p.description ? (
                <p className="text-sm">{p.description}</p>
              ) : null}
              {versions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No version published yet
                  {p.gatesChildren
                    ? ", so nobody is held back from events."
                    : "."}
                </p>
              ) : (
                <ul className="flex flex-col divide-y rounded-md border">
                  {versions.map((v) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      key={v.id}
                    >
                      <span className="flex flex-col">
                        <span className="flex items-center gap-2 font-medium">
                          Version {v.version}
                          {inForce?.id === v.id ? (
                            <StatusBadge tone="success">In force</StatusBadge>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          From {formatIso(v.effectiveOn)}
                          {v.summary ? ` · ${v.summary}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        {canManage &&
                        inForce?.id === v.id &&
                        accounts.length > 0 ? (
                          <AcknowledgementCount
                            acked={ackedBy.get(v.id)}
                            audience={audiences[p.audience ?? "everyone"]}
                            onShowMissing={(names) =>
                              setOutstanding({
                                names,
                                title: `${p.title}, version ${v.version}`,
                              })
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {ackedBy.get(v.id)?.size ?? 0} acknowledged
                          </span>
                        )}
                        <FilePreviewButton
                          className="text-primary inline-flex items-center underline-offset-4 hover:underline pointer-coarse:min-h-10"
                          src={getProtectedAttachmentHref(
                            { id: v.id, kind: "policyDocument" },
                            "inline"
                          )}
                          fileName={`${p.title}, version ${v.version}`}
                        >
                          Read
                        </FilePreviewButton>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <Dialog
        onOpenChange={(open) => !open && setOutstanding(null)}
        open={outstanding !== null}
      >
        <DialogContent className="sm:max-w-(--dialog-sm)">
          <DialogHeader>
            <DialogTitle>Haven't acknowledged</DialogTitle>
            <DialogDescription>{outstanding?.title}</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto text-sm">
            {outstanding?.names.map((name) => (
              <li className="py-2" key={name}>
                {name}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {creating ? <NewPolicyDialog onClose={() => setCreating(false)} /> : null}
      {publishing ? (
        <PublishDialog
          documents={documents.filter((d) => d.kind === "policy")}
          onClose={() => setPublishing(null)}
          policyId={publishing}
        />
      ) : null}
    </div>
  );
}

/** How many of the people a policy is for acknowledged the version in force. */
function AcknowledgementCount({
  acked,
  audience,
  onShowMissing,
}: {
  acked: Set<string> | undefined;
  audience: { id: string; name: string }[];
  onShowMissing: (names: string[]) => void;
}) {
  const missing = audience.filter((a) => !acked?.has(a.id));
  return (
    <>
      <span className="text-muted-foreground text-xs tabular-nums">
        {audience.length - missing.length} of {audience.length} acknowledged
      </span>
      {missing.length > 0 ? (
        <button
          className="text-primary inline-flex items-center text-xs underline-offset-4 hover:underline pointer-coarse:min-h-10"
          onClick={() => onShowMissing(missing.map((m) => m.name))}
          type="button"
        >
          {missing.length} haven't
        </button>
      ) : null}
    </>
  );
}
