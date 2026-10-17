import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  POLICY_AUDIENCE_LABELS,
  POLICY_SUMMARY_MAX,
  POLICY_TITLE_MAX,
  type PolicyAudience,
  policyAudienceValues,
  policyVersionOn,
} from "@pi-dash/shared/declarations";
import { GOVERNANCE_PAGE_PERMISSIONS } from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { PlainSelect } from "@/components/governance/plain-select";
import {
  epochToIso,
  formatIso,
  todayIso,
  useGovernanceDocuments,
} from "@/components/governance/register-data";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/context/app-context";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { assertAnyPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/governance/policies")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...GOVERNANCE_PAGE_PERMISSIONS),
  component: PoliciesPage,
  head: () => ({
    meta: [{ title: `Policies | ${env.VITE_APP_NAME}` }],
  }),
});

const NONE = "";

function PoliciesPage() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("governance.manage");
  const zero = useZero();
  const [policies] = useQuery(queries.policy.all());
  const [acknowledgements] = useQuery(queries.policy.acknowledgements());
  const { documents } = useGovernanceDocuments();
  const today = todayIso();
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const counts = new Map<string, number>();
  for (const a of acknowledgements) {
    counts.set(a.policyVersionId, (counts.get(a.policyVersionId) ?? 0) + 1);
  }

  return (
    <div className="app-container mx-auto max-w-5xl px-2 py-6 sm:px-4">
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
        description="The trust's policies, each with its approved versions and who has acknowledged them. Everyone the policy is for sees the version in force on their dashboard; the child-safeguarding policy must be acknowledged before joining events with children."
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
                            <Badge variant="secondary">In force</Badge>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          From {formatIso(v.effectiveOn)}
                          {v.summary ? ` · ${v.summary}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs">
                          {counts.get(v.id) ?? 0} acknowledged
                        </span>
                        <a
                          className="text-primary underline-offset-4 hover:underline"
                          href={getProtectedAttachmentHref(
                            { id: v.id, kind: "policyDocument" },
                            "inline"
                          )}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Read
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {creating ? <NewPolicyDialog onClose={() => setCreating(false)} /> : null}
      {publishing ? (
        <PublishDialog
          documents={documents.filter((d) => d.kind === "policy")}
          onClose={() => setPublishing(null)}
          policyId={publishing}
          zero={zero}
        />
      ) : null}
    </div>
  );
}

function NewPolicyDialog({ onClose }: { onClose: () => void }) {
  const zero = useZero();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<PolicyAudience>("everyone");
  const save = useEventCallback(async () => {
    const id = uuidv7();
    const result = await zero.mutate(
      mutators.policy.create({
        audience,
        description: description.trim() || null,
        id,
        title: title.trim(),
      })
    ).server;
    handleMutationResult(result, {
      entityId: id,
      errorMsg: `Couldn't add the policy: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "policy.create",
      successMsg: "Policy added. Publish its first version next.",
    });
    if (result.type !== "error") {
      onClose();
    }
  });
  return (
    <ConfirmDialog
      confirmDisabled={!title.trim()}
      confirmLabel="Add policy"
      description={
        <span className="flex flex-col gap-3 pt-2">
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="policy-title">Title</Label>
            <Input
              id="policy-title"
              maxLength={POLICY_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
          </span>
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="policy-audience">For</Label>
            <PlainSelect
              id="policy-audience"
              onChange={(v) => setAudience(v as PolicyAudience)}
              options={policyAudienceValues.map((value) => ({
                label: POLICY_AUDIENCE_LABELS[value],
                value,
              }))}
              value={audience}
            />
          </span>
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="policy-description">What it covers</Label>
            <Textarea
              id="policy-description"
              maxLength={POLICY_SUMMARY_MAX}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              value={description}
            />
          </span>
        </span>
      }
      onConfirm={save}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title="New policy"
    />
  );
}

function PublishDialog({
  documents,
  onClose,
  policyId,
  zero,
}: {
  documents: readonly { datedOn: string; id: string; title: string }[];
  onClose: () => void;
  policyId: string;
  zero: ReturnType<typeof useZero>;
}) {
  const [documentId, setDocumentId] = useState(NONE);
  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [summary, setSummary] = useState("");
  const publish = useEventCallback(async () => {
    const id = uuidv7();
    const result = await zero.mutate(
      mutators.policy.publishVersion({
        documentId,
        effectiveOn,
        id,
        policyId,
        summary: summary.trim() || null,
      })
    ).server;
    handleMutationResult(result, {
      entityId: id,
      errorMsg: `Couldn't publish it: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "policy.publishVersion",
      successMsg: "Version published",
    });
    if (result.type !== "error") {
      onClose();
    }
  });
  return (
    <ConfirmDialog
      confirmDisabled={!(documentId && effectiveOn)}
      confirmLabel="Publish"
      description={
        <span className="flex flex-col gap-3 pt-2">
          {documents.length === 0 ? (
            <span className="text-warning-foreground text-sm">
              Upload the approved policy on the Documents page, as a policy,
              first.
            </span>
          ) : null}
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="policy-document">Approved document</Label>
            <PlainSelect
              id="policy-document"
              onChange={setDocumentId}
              options={[
                { label: "Choose a document", value: NONE },
                ...documents.map((d) => ({
                  label: `${d.title} · ${formatIso(d.datedOn)}`,
                  value: d.id,
                })),
              ]}
              value={documentId}
            />
          </span>
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="policy-effective">In force from</Label>
            <Input
              id="policy-effective"
              onChange={(e) => setEffectiveOn(e.target.value)}
              type="date"
              value={effectiveOn}
            />
          </span>
          <span className="flex flex-col gap-1.5">
            <Label htmlFor="policy-summary">What changed</Label>
            <Textarea
              id="policy-summary"
              maxLength={POLICY_SUMMARY_MAX}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              value={summary}
            />
          </span>
          <span className="text-muted-foreground text-xs">
            Everyone it's for is asked to acknowledge the new version from that
            day.
          </span>
        </span>
      }
      onConfirm={publish}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title="Publish a version"
    />
  );
}
