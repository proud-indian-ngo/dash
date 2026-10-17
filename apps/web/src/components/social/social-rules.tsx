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
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import {
  formToRules,
  RULE_CARDS,
  ruleDefault,
  ruleFieldId,
  type RulesFormErrors,
  type RulesFormState,
  rulesToForm,
  sameRulesForm,
  serializeRules,
} from "./social-rules-form";
import { useConfigWriter } from "./use-config-writer";

const domId = (key: string) => `social-rule-${key.replace(".", "-")}`;

const NO_ERRORS: RulesFormErrors = { fields: {}, form: [] };

const formFor = (value: string) => rulesToForm(parseSocialRules(value).rules);

/**
 * Social page → Settings → Posting rules: times, limits, held flags and copy
 * per post kind, stored as JSON in app_config `social_rules`. Empty fields use
 * the pipeline default shown as the placeholder. The form is seeded once;
 * when another admin saves while this form has unsaved edits, a notice offers
 * to reload instead of discarding them.
 */
export function SocialRulesSettings({ stored }: { stored: string }) {
  const writeConfig = useConfigWriter();
  const parsed = parseSocialRules(stored);
  // The saved value the form was last seeded from.
  const [seed, setSeed] = useState(stored);
  const [form, setForm] = useState<RulesFormState>(() => formFor(stored));
  const [errors, setErrors] = useState<RulesFormErrors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = !sameRulesForm(form, formFor(seed));
  if (!saving && stored !== seed && !dirty) {
    // Nothing unsaved: follow the synced value.
    setSeed(stored);
    setForm(formFor(stored));
  }
  const changedElsewhere = !saving && stored !== seed && dirty;

  const setValue = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));
    setErrors((prev) => ({
      ...prev,
      fields: Object.fromEntries(
        Object.entries(prev.fields).filter(([field]) => field !== key)
      ),
    }));
  };

  const handleReload = useEventCallback(() => {
    setSeed(stored);
    setForm(formFor(stored));
    setErrors(NO_ERRORS);
  });

  /** Write `next`, showing it as saved meanwhile; restore the edits on failure. */
  const write = async (
    next: string,
    nextForm: RulesFormState,
    successMsg: string
  ) => {
    const previous = { form, seed };
    setSaving(true);
    setSeed(next);
    setForm(nextForm);
    return await writeConfig(SOCIAL_RULES_CONFIG_KEY, next, successMsg)
      .then((ok) => {
        if (!ok) {
          setSeed(previous.seed);
          setForm(previous.form);
        }
        return ok;
      })
      .finally(() => setSaving(false));
  };

  const handleSubmit = useEventCallback(async (event: FormEvent) => {
    event.preventDefault();
    const result = formToRules(form);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    setErrors(NO_ERRORS);
    const next = serializeRules(result.rules);
    if (next === stored.trim()) {
      setSeed(stored);
      setForm(rulesToForm(result.rules));
      toast.message("Nothing to save");
      return;
    }
    await write(next, rulesToForm(result.rules), "Posting rules saved");
  });

  const handleReset = useEventCallback(async () => {
    if (await write("", rulesToForm({}), "Posting rules reset to defaults")) {
      setErrors(NO_ERRORS);
      setConfirmReset(false);
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
          className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 rounded-md border p-3 text-sm"
          role="status"
        >
          The saved posting rules are invalid, so the pipeline uses its
          defaults. Save or reset to replace them.
        </div>
      ) : null}
      {changedElsewhere ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          role="status"
        >
          <span>
            Someone else saved posting rules. Saving now replaces them with this
            form.
          </span>
          <Button
            onClick={handleReload}
            size="sm"
            type="button"
            variant="outline"
          >
            Reload
          </Button>
        </div>
      ) : null}
      {RULE_CARDS.map(
        ({ description, fields, heldHint, heldLabel, kind, title }) => {
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
                    {fields.map(({ field, hint, label, type }) => {
                      const key = ruleFieldId(kind, field);
                      const id = domId(key);
                      const error = errors.fields[key];
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
                            inputMode={type === "int" ? "numeric" : undefined}
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
                              Default: {fallback}.{hint ? ` ${hint}` : ""}
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
                      Default: {SOCIAL_RULES_DEFAULTS[kind].held ? "on" : "off"}
                      .
                    </p>
                    {heldHint ? (
                      <p className="text-muted-foreground text-sm">
                        {heldHint}
                      </p>
                    ) : null}
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
        }
      )}
      {errors.form.length > 0 ? (
        <div className="text-destructive text-sm" role="alert">
          {errors.form.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
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
