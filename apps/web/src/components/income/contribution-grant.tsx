import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { grantLinkIssue } from "@pi-dash/shared/grants";
import { formatPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";

import { formatReceivedOn } from "./income-date";
import type { ContributionRow } from "./income-types";

const NO_TRANCHE = "none";

type Grant = ReturnType<typeof useGrants>[number];

function useGrants() {
  const [grants] = useQuery(queries.grant.all());
  return grants;
}

function LinkForm({
  contribution,
  grant,
  onOpenChange,
}: {
  contribution: ContributionRow;
  grant: Grant;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const linked = contribution.grantId === grant.id;
  const tranches = [...grant.tranches].sort(
    (a, b) => a.expectedOn - b.expectedOn
  );
  const form = useForm({
    defaultValues: {
      trancheId: (linked && contribution.grantTrancheId) || NO_TRANCHE,
    },
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(
        mutators.grant.linkContribution({
          contributionId: contribution.id,
          grantId: grant.id,
          trancheId: value.trancheId === NO_TRANCHE ? null : value.trancheId,
        })
      ).server;
      handleMutationResult(res, {
        entityId: contribution.id,
        errorMsg: "Couldn't link the contribution",
        mutation: "grant.linkContribution",
        successMsg: `Counted towards ${grant.title}`,
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
  });
  const unlink = useEventCallback(async () => {
    const res = await zero.mutate(
      mutators.grant.linkContribution({
        contributionId: contribution.id,
        grantId: null,
        trancheId: null,
      })
    ).server;
    handleMutationResult(res, {
      entityId: contribution.id,
      errorMsg: "Couldn't unlink the contribution",
      mutation: "grant.linkContribution",
      successMsg: "Contribution unlinked",
    });
    if (res.type !== "error") {
      onOpenChange(false);
    }
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <SelectField
        label="Tranche"
        name="trancheId"
        options={[
          { label: "No tranche", value: NO_TRANCHE },
          ...tranches.map((t, i) => ({
            label: `Tranche ${i + 1} · ${formatReceivedOn(t.expectedOn)} · ${formatPaise(t.amountPaise)}`,
            value: t.id,
          })),
        ]}
      />
      {linked ? (
        <div>
          <Button onClick={unlink} type="button" variant="outline">
            Unlink from grant
          </Button>
        </div>
      ) : null}
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={linked ? "Save tranche" : "Link contribution"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/**
 * The contribution sheet's Grant fact (finance.view): the grant it counts
 * towards, and for finance.manage a dialog to link it. A grant funds one
 * project, so the only grant it can count towards is its project's, and
 * only when the grantor gave it.
 */
export function ContributionGrantFact({
  contribution,
}: {
  contribution: ContributionRow;
}) {
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const grants = useGrants();
  const [open, setOpen] = useState(false);
  const linked = grants.find((g) => g.id === contribution.grantId);
  const candidate = grants.find((g) => g.projectId === contribution.projectId);
  const issue = candidate
    ? grantLinkIssue(
        {
          partyId: contribution.partyId,
          programmeId: contribution.programmeId ?? null,
          projectId: contribution.projectId ?? null,
          status: contribution.status,
        },
        candidate
      )
    : "No grant funds this contribution's project";
  const target = linked ?? (issue ? null : candidate);

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {linked ? (
        <Link
          className="text-primary underline-offset-2 hover:underline"
          data-testid="contribution-grant-link"
          params={{ id: linked.id }}
          to="/finance/grants/$id"
        >
          {linked.title}
        </Link>
      ) : (
        <span className="text-muted-foreground">Not linked</span>
      )}
      {canManage && target ? (
        <Button
          className="h-auto px-1.5 py-0.5 text-xs"
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {linked ? "Change" : "Link to grant"}
        </Button>
      ) : null}
      {target ? (
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogContent className="sm:max-w-(--dialog-md)">
            <DialogHeader>
              <DialogTitle>
                {linked ? "Grant link" : "Link to grant"}
              </DialogTitle>
              <DialogDescription>
                {`${target.title}: this contribution counts as money received under the grant.`}
              </DialogDescription>
            </DialogHeader>
            {open ? (
              <LinkForm
                contribution={contribution}
                grant={target}
                onOpenChange={setOpen}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </span>
  );
}
