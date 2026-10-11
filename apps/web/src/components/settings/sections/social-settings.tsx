import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  SOCIAL_ALL_TIME_CONFIG_KEYS,
  SOCIAL_APPROVER_CONFIG_KEY,
} from "@pi-dash/shared/social-api";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { type FormEvent, useState } from "react";

import { handleMutationResult } from "@/lib/mutation-result";

const NONE = "__none__";
const NON_NEGATIVE_NUMBER_RE = /^\d+(\.\d+)?$/;

const OVERRIDE_FIELDS = [
  { field: "optimists", label: "Optimists" },
  { field: "hours", label: "Volunteer hours" },
  { field: "reached", label: "Children reached" },
] as const;

type OverrideField = (typeof OVERRIDE_FIELDS)[number]["field"];

/** Blank, or a non-negative number the social stats endpoint accepts. */
export function isValidOverride(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || NON_NEGATIVE_NUMBER_RE.test(trimmed);
}

function useConfigWriter() {
  const zero = useZero();
  return async (key: string, value: string) => {
    const trimmed = value.trim();
    const res = await zero.mutate(
      trimmed
        ? mutators.appConfig.upsert({ key, value: trimmed })
        : mutators.appConfig.remove({ key })
    ).server;
    handleMutationResult(res, {
      entityId: key,
      errorMsg: "Couldn't save social setting",
      mutation: trimmed ? "appConfig.upsert" : "appConfig.remove",
    });
    return res.type !== "error";
  };
}

function ApproverPicker({ value }: { value: string }) {
  const [users] = useQuery(queries.user.all());
  const writeConfig = useConfigWriter();
  const activeUsers = users
    .filter((user) => user.isActive && !user.banned)
    .sort((a, b) => a.name.localeCompare(b.name));
  const labelById = new Map(activeUsers.map((user) => [user.id, user.name]));
  const items = [NONE, ...activeUsers.map((user) => user.id)];

  const itemToLabel = useEventCallback((item: string | null) => {
    if (!item || item === NONE) {
      return "None";
    }
    return labelById.get(item) ?? "Unknown user";
  });
  const handleChange = useEventCallback(async (next: string | null) => {
    const userId = !next || next === NONE ? "" : next;
    if (userId === value) {
      return;
    }
    await writeConfig(SOCIAL_APPROVER_CONFIG_KEY, userId);
  });

  return (
    <div className="grid gap-2">
      <Label htmlFor="social-approver">Social digest approver</Label>
      <Combobox
        items={items}
        itemToStringLabel={itemToLabel}
        onValueChange={handleChange}
        value={value || NONE}
      >
        <ComboboxInput
          className="w-full sm:max-w-80"
          id="social-approver"
          placeholder="None"
        />
        <ComboboxContent>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {itemToLabel(item)}
              </ComboboxItem>
            )}
          </ComboboxList>
          <ComboboxEmpty>No matching users.</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
      <p className="text-muted-foreground text-sm">
        Receives the daily social digest on WhatsApp. Without one, the digest is
        not sent.
      </p>
    </div>
  );
}

function AllTimeOverrides({
  initial,
}: {
  initial: Record<OverrideField, string>;
}) {
  const writeConfig = useConfigWriter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const invalid = OVERRIDE_FIELDS.some(
    ({ field }) => !isValidOverride(values[field])
  );
  const dirty = OVERRIDE_FIELDS.some(
    ({ field }) => values[field].trim() !== initial[field]
  );

  const handleSubmit = useEventCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (invalid) {
      return;
    }
    setSaving(true);
    try {
      for (const { field } of OVERRIDE_FIELDS) {
        if (values[field].trim() !== initial[field]) {
          await writeConfig(SOCIAL_ALL_TIME_CONFIG_KEYS[field], values[field]);
        }
      }
    } finally {
      setSaving(false);
    }
  });

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div>
        <p className="text-sm font-medium">All-time totals</p>
        <p className="text-muted-foreground text-sm">
          Optional. Replace the computed all-time figures on the impact card,
          e.g. to include history from before the dashboard. Leave empty to use
          the computed value.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {OVERRIDE_FIELDS.map(({ field, label }) => {
          const id = `social-all-time-${field}`;
          const fieldInvalid = !isValidOverride(values[field]);
          return (
            <div className="grid gap-2" key={field}>
              <Label htmlFor={id}>{label}</Label>
              <Input
                aria-invalid={fieldInvalid}
                id={id}
                inputMode="numeric"
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field]: event.target.value,
                  }))
                }
                placeholder="Computed"
                value={values[field]}
              />
              {fieldInvalid ? (
                <p className="text-destructive text-xs" role="alert">
                  Use a number of 0 or more
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <Button
        className="self-start"
        disabled={!dirty || invalid || saving}
        type="submit"
        variant="outline"
      >
        Save totals
      </Button>
    </form>
  );
}

/** Settings read by the social API (`/api/social/v1`). */
export function SocialSettings({
  configs,
}: {
  configs: readonly { key: string; value: string }[];
}) {
  const valueOf = (key: string) =>
    configs.find((config) => config.key === key)?.value ?? "";
  const initialOverrides = {
    hours: valueOf(SOCIAL_ALL_TIME_CONFIG_KEYS.hours),
    optimists: valueOf(SOCIAL_ALL_TIME_CONFIG_KEYS.optimists),
    reached: valueOf(SOCIAL_ALL_TIME_CONFIG_KEYS.reached),
  };

  return (
    <section aria-labelledby="social-settings-heading" className="grid gap-4">
      <h3 className="text-sm font-medium" id="social-settings-heading">
        Social posts
      </h3>
      <ApproverPicker value={valueOf(SOCIAL_APPROVER_CONFIG_KEY)} />
      <AllTimeOverrides
        initial={initialOverrides}
        // Re-seed the fields when another admin changes a saved value.
        key={Object.values(initialOverrides).join("|")}
      />
    </section>
  );
}
