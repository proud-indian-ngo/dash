import { ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@pi-dash/design-system/components/ui/item";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { env } from "@pi-dash/env/web";
import { mutators } from "@pi-dash/zero/mutators";
import type { Zero } from "@rocicorp/zero";
import { ZeroContext, useZero } from "@rocicorp/zero/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import * as z from "zod";

import { useOutstandingPolicies } from "@/components/governance/policy-gate";
import { Loader } from "@/components/loader";
import { FilePreviewDialog } from "@/components/shared/file-preview";
import { StandalonePage } from "@/components/shared/not-found-state";
import { Tag } from "@/components/shared/status-badge";
import { ZeroConnectionMonitor } from "@/components/zero-connection-monitor";
import { ZeroInit } from "@/components/zero-init";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { getCachedAuth, invalidateAuthCache } from "@/lib/auth-cache";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { signOut } from "@/lib/sign-out";

// Outside the app layout, so its guard (which sends people here) never runs.
// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/accept-policies")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ location }) => {
    const { permissions, session } = await getCachedAuth();
    if (!session) {
      throw redirect({ search: { redirect: location.href }, to: "/login" });
    }
    return { permissions, session };
  },
  head: () => ({
    meta: [{ title: `Before you continue | ${env.VITE_APP_NAME}` }],
  }),
  component: AcceptPoliciesRoute,
});

function AcceptPoliciesRoute() {
  const { permissions, session } = Route.useRouteContext();

  return (
    <AcceptPoliciesRuntime
      key={`${session.user.id}:${session.user.role}`}
      permissions={permissions}
      session={session}
    />
  );
}

function AcceptPoliciesRuntime({
  permissions,
  session,
}: {
  permissions: string[];
  session: ReturnType<typeof Route.useRouteContext>["session"];
}) {
  const [zero, setZero] = useState<Zero>();

  return (
    <ZeroContext value={zero}>
      <ZeroInit
        onReady={setZero}
        permissions={permissions}
        role={session.user.role}
        userId={session.user.id}
      >
        {null}
      </ZeroInit>
      {zero ? (
        <AcceptPoliciesPage />
      ) : (
        <StandalonePage>
          <Loader />
        </StandalonePage>
      )}
    </ZeroContext>
  );
}

function AcceptPoliciesPage() {
  const zero = useZero();
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();
  const { complete, items } = useOutstandingPolicies();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  // Kept after closing, so the viewer animates out and returns focus.
  const [reading, setReading] = useState<{
    src: string;
    title: string;
  } | null>(null);
  const [readingOpen, setReadingOpen] = useState(false);

  // The layout reads the gate from the cached session, so drop it first.
  const proceed = useCallback(() => {
    invalidateAuthCache();
    navigate({
      href: target?.startsWith("/") && !target.startsWith("//") ? target : "/",
      replace: true,
    });
  }, [navigate, target]);

  const nothingLeft = complete && items.length === 0;
  useEffect(() => {
    if (nothingLeft && !busy) {
      proceed();
    }
  }, [busy, nothingLeft, proceed]);

  const logOut = (
    <Button onClick={() => signOut(zero)} type="button" variant="link">
      Log out
    </Button>
  );

  // Outside the app layout, so the connection is watched here too, and
  // logging out stays possible while the policies load.
  if (!complete || items.length === 0) {
    return (
      <StandalonePage>
        <ZeroConnectionMonitor />
        <div className="flex flex-col items-center gap-4">
          <Loader />
          {logOut}
        </div>
      </StandalonePage>
    );
  }

  const accept = async () => {
    setBusy(true);
    const results = await Promise.all(
      items.map(
        (item) =>
          zero.mutate(
            mutators.policyAcknowledgement.acknowledge({
              id: uuidv7(),
              policyVersionId: item.version.id,
            })
          ).server
      )
    );
    const failed = results.find((r) => r.type === "error");
    if (failed) {
      setBusy(false);
      handleMutationResult(failed, {
        entityId: items.map((i) => i.version.id).join(","),
        errorMsg: `Couldn't record it: ${getMutationResultErrorMessage(failed.type === "error" ? failed.error : undefined, "something went wrong")}`,
        mutation: "policyAcknowledgement.acknowledge",
      });
      return;
    }
    proceed();
  };

  return (
    <StandalonePage>
      <ZeroConnectionMonitor />
      {/* Phones top-align it, as the sign-in pages do. */}
      <div className="flex w-full max-w-md flex-col gap-6 self-start pt-6 md:self-auto md:pt-0">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold">
            Before you continue
          </h1>
          <p className="text-muted-foreground text-sm">
            Proud Indian asks everyone using the dashboard to read and accept
            these policies.
          </p>
        </div>
        <ItemGroup className="gap-2">
          {items.map((item) => (
            <div key={item.version.id} role="listitem">
              <Item
                render={
                  <button
                    aria-haspopup="dialog"
                    onClick={() => {
                      setReading({
                        src: getProtectedAttachmentHref(
                          { id: item.version.id, kind: "policyDocument" },
                          "inline"
                        ),
                        title: item.policy.title,
                      });
                      setReadingOpen(true);
                    }}
                    type="button"
                  />
                }
                variant="outline"
              >
                <ItemContent>
                  <ItemTitle>{item.policy.title}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  {item.updated ? <Tag>Updated</Tag> : null}
                  <HugeiconsIcon
                    className="text-muted-foreground size-4"
                    icon={ViewIcon}
                    strokeWidth={2}
                  />
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
        {reading ? (
          <FilePreviewDialog
            onOpenChange={setReadingOpen}
            open={readingOpen}
            src={reading.src}
            fileName={reading.title}
          />
        ) : null}
        <Label
          className="flex items-start gap-2 font-normal pointer-coarse:min-h-10 pointer-coarse:items-center"
          htmlFor="accept-policies"
        >
          <Checkbox
            checked={accepted}
            id="accept-policies"
            onCheckedChange={(checked) => setAccepted(checked === true)}
          />
          I have read and accept these policies
        </Label>
        <div className="flex flex-col gap-2">
          <Button disabled={!accepted || busy} onClick={accept} type="button">
            Continue
          </Button>
          {logOut}
        </div>
      </div>
    </StandalonePage>
  );
}
