import {
  Alert02Icon,
  AlertCircleIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  type RegisterInput,
  type RegisterWarningSeverity,
  registerWarnings,
} from "@pi-dash/shared/governance";

const STYLE: Record<RegisterWarningSeverity, string> = {
  error:
    "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/20",
  info: "border-border bg-muted/40 text-muted-foreground",
  warning:
    "border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10",
};

const ICON = {
  error: AlertCircleIcon,
  info: InformationCircleIcon,
  warning: Alert02Icon,
} as const;

/** Board-level warnings first; unevidenced facts are summed up in one line. */
export function RegisterWarnings({
  input,
  on,
}: {
  input: RegisterInput;
  on: string;
}) {
  const warnings = registerWarnings(input, on);
  const unevidenced = warnings.filter((w) => w.code === "unevidenced");
  const shown = warnings.filter((w) => w.code !== "unevidenced");
  if (input.trustees.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Register warnings" className="flex flex-col gap-2">
      {shown.map((warning) => (
        <li
          className={cn(
            "flex items-start gap-2 rounded-md border p-3 text-sm",
            STYLE[warning.severity]
          )}
          key={`${warning.code}-${warning.rowIds.join("-")}`}
        >
          <HugeiconsIcon
            className="mt-0.5 size-4 shrink-0"
            icon={ICON[warning.severity]}
            strokeWidth={2}
          />
          <span>{warning.message}</span>
        </li>
      ))}
      {unevidenced.length > 0 ? (
        <li
          className={cn(
            "flex items-start gap-2 rounded-md border p-3 text-sm",
            STYLE.info
          )}
        >
          <HugeiconsIcon
            className="mt-0.5 size-4 shrink-0"
            icon={ICON.info}
            strokeWidth={2}
          />
          <span>
            {unevidenced.length === 1
              ? "1 date in the register has"
              : `${unevidenced.length} dates in the register have`}{" "}
            no document behind it yet. They are marked "Unevidenced"; open the
            trustee to link a document from the vault.
          </span>
        </li>
      ) : null}
    </ul>
  );
}
