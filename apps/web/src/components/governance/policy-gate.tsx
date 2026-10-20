import { outstandingPolicyVersions } from "@pi-dash/shared/declarations";
import { isHeldOn } from "@pi-dash/shared/governance";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { epochToIso } from "@/components/governance/register-data";
import { useIndiaToday } from "@/hooks/use-india-today";

/** Whether the signed-in account is a trustee in office today. */
export function useInOffice(today: string) {
  const [mine, result] = useQuery(queries.trustee.me());
  const inOffice = mine.some((t) =>
    (t.terms ?? []).some((term) =>
      isHeldOn(
        {
          endedOn: epochToIso(term.endedOn ?? null),
          endsOn: epochToIso(term.endsOn ?? null),
          startsOn: epochToIso(term.startsOn),
        },
        today
      )
    )
  );
  return { complete: result.type === "complete", inOffice };
}

/**
 * The policy versions in force the signed-in person still has to accept.
 * `complete` once every query has synced, so a half-loaded list never sends
 * anyone to the accept page.
 */
export function useOutstandingPolicies() {
  // A version that takes effect at midnight changes no row, so the day
  // itself has to move.
  const today = useIndiaToday();
  const office = useInOffice(today);
  const [policies, policiesResult] = useQuery(queries.policy.all());
  const [acknowledged, acknowledgedResult] = useQuery(
    queries.policy.myAcknowledgements()
  );
  const items = outstandingPolicyVersions({
    acknowledged: new Set(acknowledged.map((a) => a.policyVersionId)),
    inOffice: office.inOffice,
    on: today,
    policies: policies.map((p) => ({
      audience: p.audience ?? "everyone",
      title: p.title,
      versions: (p.versions ?? []).map((v) => ({
        effectiveOn: epochToIso(v.effectiveOn),
        id: v.id,
        version: v.version,
      })),
    })),
  });
  return {
    complete:
      office.complete &&
      policiesResult.type === "complete" &&
      acknowledgedResult.type === "complete",
    items,
  };
}

/**
 * Sends a signed-in person to the accept page once a policy version they
 * haven't accepted is in force. The layout's `beforeLoad` covers sign-in and
 * page loads; this covers a version published or taking effect mid-session.
 */
export function PolicyGate() {
  const { complete, items } = useOutstandingPolicies();
  const navigate = useNavigate();
  const href = useLocation({ select: (l) => l.href });
  // While the redirect is pending the location is already the accept page;
  // redirecting again from there would nest it in its own `redirect`.
  const leaving = useLocation({
    select: (l) => l.pathname === "/accept-policies",
  });
  const pending = complete && items.length > 0 && !leaving;
  useEffect(() => {
    if (pending) {
      navigate({
        replace: true,
        search: { redirect: href },
        to: "/accept-policies",
      });
    }
  }, [href, navigate, pending]);
  return null;
}
