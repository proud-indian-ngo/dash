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
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  parseSocialPausedKinds,
  SOCIAL_ALL_TIME_CONFIG_KEYS,
  SOCIAL_APPROVER_CONFIG_KEY,
  SOCIAL_PAUSABLE_KINDS,
  SOCIAL_PAUSED_CONFIG_KEY,
  SOCIAL_PAUSED_KINDS_CONFIG_KEY,
  SOCIAL_RULES_CONFIG_KEY,
  type SocialPostKindValue,
  socialPostKinds,
} from "@pi-dash/shared/social-api";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { type FormEvent, useState } from "react";

import { handleMutationResult } from "@/lib/mutation-result";

import { SocialRulesSettings } from "./social-rules";
import { useSocialPeople } from "./use-social-people";

const NONE = "__none__";
const NON_NEGATIVE_NUMBER_RE = /^\d+(\.\d+)?$/;

const KIND_COPY: Record<
  (typeof SOCIAL_PAUSABLE_KINDS)[number],
  { description: string; label: string }
> = {
  impact: {
    description: "The monthly impact card.",
    label: "Impact",
  },
  recap: {
    description: "Posts after a session, from its recap and photos.",
    label: "Recap",
  },
  schedule: {
    description: "The weekly schedule of upcoming sessions.",
    label: "Schedule",
  },
  "volunteer-call": {
    description: "Calls for volunteers before sessions that need more.",
    label: "Volunteer call",
  },
};

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
  const people = useSocialPeople([value]);
  const writeConfig = useConfigWriter();
  const labelById = people?.names ?? new Map<string, string>();
  const items = [NONE, ...(people?.candidates ?? []).map((user) => user.id)];

  const itemToLabel = useEventCallback((item: string | null) => {
    if (!item || item === NONE) {
      return "None";
    }
    return labelById.get(item) ?? (people ? "Unknown user" : "Loading...");
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

/** Next comma-separated `social_paused_kinds` value, keeping unlisted kinds. */
export function togglePausedKind(
  current: string,
  kind: SocialPostKindValue,
  paused: boolean
): string {
  const kinds = new Set(parseSocialPausedKinds(current));
  if (paused) {
    kinds.add(kind);
  } else {
    kinds.delete(kind);
  }
  return socialPostKinds.filter((k) => kinds.has(k)).join(",");
}

function PauseSettings({
  paused,
  pausedKinds,
}: {
  paused: boolean;
  pausedKinds: string;
}) {
  const writeConfig = useConfigWriter();
  const pausedSet = new Set(parseSocialPausedKinds(pausedKinds));

  const handlePauseAll = useEventCallback(async (checked: boolean) => {
    await writeConfig(SOCIAL_PAUSED_CONFIG_KEY, checked ? "true" : "false");
  });
  const handleKind = async (kind: SocialPostKindValue, checked: boolean) => {
    await writeConfig(
      SOCIAL_PAUSED_KINDS_CONFIG_KEY,
      togglePausedKind(pausedKinds, kind, checked)
    );
  };

  return (
    <div className="grid gap-4">
      {paused ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          role="status"
        >
          All social posts are paused. The hourly run does nothing until you
          turn this off.
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="social-pause-all">Pause all posts</Label>
          <p className="text-muted-foreground text-sm">
            While on, the hourly run does nothing: no new posts are planned,
            rendered or queued in Buffer. Posts already in Buffer still publish
            unless you drop them.
          </p>
        </div>
        <Switch
          checked={paused}
          id="social-pause-all"
          onCheckedChange={handlePauseAll}
        />
      </div>
      <div className="grid gap-3">
        <div>
          <p className="text-sm font-medium">Pause by kind</p>
          <p className="text-muted-foreground text-sm">
            Skip one kind of post and keep the others running.
          </p>
        </div>
        {SOCIAL_PAUSABLE_KINDS.map((kind) => {
          const id = `social-pause-${kind}`;
          return (
            <div className="flex items-center justify-between gap-4" key={kind}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Label htmlFor={id}>
                  Pause {KIND_COPY[kind].label.toLowerCase()} posts
                </Label>
                <p className="text-muted-foreground text-sm">
                  {KIND_COPY[kind].description}
                </p>
              </div>
              <Switch
                checked={pausedSet.has(kind)}
                id={id}
                onCheckedChange={(checked) => handleKind(kind, checked)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Social page → Settings: pause switches, posting rules, digest approver and
 * all-time totals.
 */
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
    <div className="grid max-w-3xl gap-8">
      <section aria-labelledby="social-pause-heading" className="grid gap-4">
        <h2 className="text-sm font-medium" id="social-pause-heading">
          Posting
        </h2>
        <PauseSettings
          paused={valueOf(SOCIAL_PAUSED_CONFIG_KEY) === "true"}
          pausedKinds={valueOf(SOCIAL_PAUSED_KINDS_CONFIG_KEY)}
        />
      </section>
      <section aria-labelledby="social-rules-heading" className="grid gap-4">
        <h2 className="text-sm font-medium" id="social-rules-heading">
          Posting rules
        </h2>
        <SocialRulesSettings
          // Re-seed the form when the saved rules change.
          key={valueOf(SOCIAL_RULES_CONFIG_KEY)}
          stored={valueOf(SOCIAL_RULES_CONFIG_KEY)}
        />
      </section>
      <section aria-labelledby="social-digest-heading" className="grid gap-4">
        <h2 className="text-sm font-medium" id="social-digest-heading">
          Digest and impact numbers
        </h2>
        <ApproverPicker value={valueOf(SOCIAL_APPROVER_CONFIG_KEY)} />
        <AllTimeOverrides
          initial={initialOverrides}
          // Re-seed the fields when another admin changes a saved value.
          key={Object.values(initialOverrides).join("|")}
        />
      </section>
    </div>
  );
}
