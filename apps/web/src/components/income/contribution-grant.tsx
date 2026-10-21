import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { grantLinkIssue, grantPeriodIssue } from "@pi-dash/shared/grants";
import { epochDayToIso } from "@pi-dash/shared/income";
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
  grants,
  onOpenChange,
}: {
  contribution: ContributionRow;
  /** The grants it can count towards; the linked one first, if any. */
  grants: readonly Grant[];
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const linked = grants.some((g) => g.id === contribution.grantId);
  const form = useForm({
    defaultValues: {
      grantId: grants[0]?.id ?? "",
      trancheId: (linked && contribution.grantTrancheId) || NO_TRANCHE,
    },
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        // Tranches belong to one grant.
        if (fieldApi.name === "grantId") {
          formApi.setFieldValue("trancheId", NO_TRANCHE);
        }
      },
    },
    onSubmit: async ({ value }) => {
      const grant = grants.find((g) => g.id === value.grantId);
      if (!grant) {
        return;
      }
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
      {grants.length > 1 ? (
        <SelectField
          label="Grant"
          name="grantId"
          options={grants.map((g) => ({
            label: `${g.title} · ${formatReceivedOn(g.startsOn)} – ${formatReceivedOn(g.endsOn)}`,
            value: g.id,
          }))}
        />
      ) : null}
      <form.Subscribe selector={(state) => state.values.grantId}>
        {(grantId) => {
          const tranches = [
            ...(grants.find((g) => g.id === grantId)?.tranches ?? []),
          ].sort((a, b) => a.expectedOn - b.expectedOn);
          return (
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
          );
        }}
      </form.Subscribe>
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
        submitLabel={linked ? "Save link" : "Link contribution"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/**
 * The contribution sheet's Grant fact (finance.view): the grant it counts
 * towards, and for finance.manage a dialog to link it. Only grants on the
 * contribution's project, from its giver, qualify (`grantLinkIssue`); a
 * project's grants never overlap in time, so there is usually one.
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
  const receivedOn = epochDayToIso(contribution.receivedOn);
  const periodOf = (g: Grant) => ({
    endsOn: epochDayToIso(g.endsOn),
    id: g.id,
    startsOn: epochDayToIso(g.startsOn),
    title: g.title,
  });
  const projectGrants = grants
    .filter((g) => g.projectId === contribution.projectId)
    .map(periodOf);
  const gift = {
    channel: contribution.channel,
    partyId: contribution.partyId,
    programmeId: contribution.programmeId ?? null,
    projectId: contribution.projectId ?? null,
    status: contribution.status,
  };
  const eligible = grants
    .filter((g) => grantLinkIssue(gift, g) === null)
    .filter((g) => grantPeriodIssue(receivedOn, g.id, projectGrants) === null);
  // Inside a grant's period, only that grant qualifies; outside every
  // period, any of the project's grants does.
  const outsidePeriods =
    eligible.length > 0 &&
    !projectGrants.some(
      (g) => g.startsOn <= receivedOn && receivedOn <= g.endsOn
    );
  const choices = linked
    ? [linked, ...eligible.filter((g) => g.id !== linked.id)]
    : eligible;

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
      {canManage && choices.length > 0 ? (
        <>
          <Button
            className="h-auto px-1.5 py-0.5 text-xs"
            onClick={() => setOpen(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {linked ? "Change" : "Link to grant"}
          </Button>
          <Dialog onOpenChange={setOpen} open={open}>
            <DialogContent className="sm:max-w-(--dialog-md)">
              <DialogHeader>
                <DialogTitle>
                  {linked ? "Grant link" : "Link to grant"}
                </DialogTitle>
                <DialogDescription>
                  {outsidePeriods
                    ? "Received outside every grant's period, so it can count towards any of this project's grants, as an advance or a late tranche."
                    : "The contribution counts as money received under the grant whose period covers its date."}
                </DialogDescription>
              </DialogHeader>
              {open ? (
                <LinkForm
                  contribution={contribution}
                  grants={choices}
                  onOpenChange={setOpen}
                />
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </span>
  );
}
