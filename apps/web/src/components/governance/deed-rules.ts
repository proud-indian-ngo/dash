import {
  type DeedRules,
  RESOLUTION_THRESHOLD_LABELS,
  TRUSTEE_OFFICE_LABELS,
} from "@pi-dash/shared/governance";

/** How many trustees must be present, in the deed's words. */
export function quorumText(rules: DeedRules): string {
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

/** Each rule of a deed version as a label and its wording, in reading order. */
export function deedRuleLines(
  rules: DeedRules
): { label: string; value: string }[] {
  return [
    {
      label: "Board size",
      value: `${rules.minTrustees} to ${rules.maxTrustees} trustees`,
    },
    { label: "Quorum at meetings", value: quorumText(rules) },
    { label: "Casting vote", value: castingText(rules) },
    {
      label: "Meeting notice",
      value: `At least ${rules.noticeDays} days, with an agenda`,
    },
    {
      label: "Circulars issued by",
      value: rules.circularIssuers
        .map((office) => TRUSTEE_OFFICE_LABELS[office])
        .join(", then "),
    },
    {
      label: "Circulation by email and electronic signatures",
      value: rules.electronicCirculation ? "Allowed" : "Not provided for",
    },
    {
      label: "Video attendance counts as present",
      value: rules.videoCountsPresent ? "Yes" : "Not provided for",
    },
    {
      label: "Co-option",
      value: `Up to ${rules.coOptionMaxYears} years at a time`,
    },
    {
      label: "Amending the deed",
      value: `${RESOLUTION_THRESHOLD_LABELS[rules.amendmentThreshold]}, with the Income-tax Commissioner's prior approval`,
    },
  ];
}
