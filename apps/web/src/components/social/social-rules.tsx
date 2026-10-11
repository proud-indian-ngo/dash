import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Switch } from "@pi-dash/design-system/components/ui/switch";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  parseSocialRules,
  SOCIAL_RULES_CONFIG_KEY,
  SOCIAL_RULES_DEFAULTS,
} from "@pi-dash/shared/social-api";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { type FormEvent, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

import {
  formToRules,
  RULE_CARDS,
  ruleDefault,
  ruleFieldId,
  type RulesFormState,
  rulesToForm,
  serializeRules,
} from "./social-rules-form";

const domId = (key: string) => `social-rule-${key.replace(".", "-")}`;

function useRulesWriter() {
  const zero = useZero();
  return async (value: string, successMsg: string) => {
    const res = await zero.mutate(
      value
        ? mutators.appConfig.upsert({ key: SOCIAL_RULES_CONFIG_KEY, value })
        : mutators.appConfig.remove({ key: SOCIAL_RULES_CONFIG_KEY })
    ).server;
    handleMutationResult(res, {
      entityId: SOCIAL_RULES_CONFIG_KEY,
      errorMsg: "Couldn't save posting rules",
      mutation: value ? "appConfig.upsert" : "appConfig.remove",
      successMsg,
    });
    return res.type !== "error";
  };
}

/**
 * Social page → Settings → Posting rules: times, limits, held flags and copy
 * per post kind, stored as JSON in app_config `social_rules`. Empty fields use
 * the pipeline default shown as the placeholder.
 */
export function SocialRulesSettings({ stored }: { stored: string }) {
  const writeRules = useRulesWriter();
  const parsed = parseSocialRules(stored);
  const [form, setForm] = useState<RulesFormState>(() =>
    rulesToForm(parsed.rules)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const setValue = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));
    setErrors((prev) => {
      const { [key]: _cleared, ...rest } = prev;
      return rest;
    });
  };

  const handleSubmit = useEventCallback(async (event: FormEvent) => {
    event.preventDefault();
    const result = formToRules(form);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const next = serializeRules(result.rules);
    if (next === stored.trim()) {
      return;
    }
    setSaving(true);
    try {
      await writeRules(next, "Posting rules saved");
    } finally {
      setSaving(false);
    }
  });

  const handleReset = useEventCallback(async () => {
    setSaving(true);
    try {
      if (await writeRules("", "Posting rules reset to defaults")) {
        setConfirmReset(false);
      }
    } finally {
      setSaving(false);
    }
  });

  return (
    <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
      <p className="text-muted-foreground text-sm">
        When each kind of post is built and posted, its limits and copy. Leave a
        field empty to use the default shown in it. Times are IST, 24-hour.
      </p>
      {parsed.error ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          role="status"
        >
          The saved posting rules are invalid, so the pipeline uses its
          defaults. Save or reset to replace them.
        </div>
      ) : null}
      {RULE_CARDS.map(({ description, fields, heldLabel, kind, title }) => {
        const heldId = domId(`${kind}.held`);
        return (
          <Card key={kind} size="sm">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {fields.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.map(({ field, label, type }) => {
                    const key = ruleFieldId(kind, field);
                    const id = domId(key);
                    const error = errors[key];
                    const fallback = ruleDefault(kind, field);
                    return (
                      <div
                        className={
                          type === "text"
                            ? "grid gap-2 sm:col-span-2"
                            : "grid gap-2"
                        }
                        key={key}
                      >
                        <Label htmlFor={id}>{label}</Label>
                        <Input
                          aria-describedby={`${id}-help`}
                          aria-invalid={!!error}
                          id={id}
                          inputMode={type === "text" ? undefined : "numeric"}
                          onChange={(event) =>
                            setValue(key, event.target.value)
                          }
                          placeholder={fallback}
                          value={form.values[key] ?? ""}
                        />
                        {error ? (
                          <p
                            className="text-destructive text-xs"
                            id={`${id}-help`}
                            role="alert"
                          >
                            {error}
                          </p>
                        ) : (
                          <p
                            className="text-muted-foreground text-xs"
                            id={`${id}-help`}
                          >
                            Default: {fallback}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Label htmlFor={heldId}>{heldLabel}</Label>
                  <p className="text-muted-foreground text-sm">
                    Lands in Buffer drafts for the approver to schedule.
                    Default: {SOCIAL_RULES_DEFAULTS[kind].held ? "on" : "off"}.
                  </p>
                </div>
                <Switch
                  checked={form.held[kind]}
                  id={heldId}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      held: { ...prev.held, [kind]: checked },
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button disabled={saving} type="submit" variant="outline">
          Save rules
        </Button>
        <Button
          disabled={saving || !stored.trim()}
          onClick={() => setConfirmReset(true)}
          type="button"
          variant="ghost"
        >
          Reset to defaults
        </Button>
      </div>
      <ConfirmDialog
        confirmLabel="Reset rules"
        description="Every posting rule goes back to the pipeline default."
        loading={saving}
        loadingLabel="Resetting..."
        onConfirm={handleReset}
        onOpenChange={setConfirmReset}
        open={confirmReset}
        title="Reset posting rules?"
        variant="destructive"
      />
    </form>
  );
}
