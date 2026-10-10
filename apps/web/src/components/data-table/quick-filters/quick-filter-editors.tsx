import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  FilterField,
  FilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Input } from "@pi-dash/design-system/components/ui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@pi-dash/design-system/components/ui/toggle-group";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useState } from "react";

import {
  DATE_PRESETS,
  datePresetRule,
  isExcluding,
  matchDatePreset,
  selectedValues,
  selectRule,
} from "./quick-filter-model";

type RuleChange = (next: { operator: string; value: unknown } | null) => void;

const SEARCH_THRESHOLD = 7;

function EditorFooter({
  children,
  onClear,
}: {
  children?: React.ReactNode;
  onClear?: () => void;
}) {
  return (
    <div className="text-muted-foreground mt-1 flex items-center justify-between border-t pt-1.5 text-xs">
      <span>{children}</span>
      {onClear ? (
        <button
          className="hover:text-foreground rounded px-1 py-0.5"
          onClick={onClear}
          type="button"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

/**
 * A checklist of options with row counts. `single` writes one `is` value, for
 * server-paged tables that only read single equality.
 */
export function SelectFilterEditor({
  counts,
  field,
  onChange,
  rule,
  single = false,
}: {
  counts?: ReadonlyMap<string, number>;
  field: FilterField;
  onChange: RuleChange;
  rule: FilterRule | undefined;
  single?: boolean;
}) {
  const options = Array.isArray(field.options) ? field.options : [];
  const [search, setSearch] = useState("");
  const selected = selectedValues(rule);
  const exclude = isExcluding(rule);
  const query = search.trim().toLowerCase();
  const visible = query
    ? options.filter((option) => option.label.toLowerCase().includes(query))
    : options;

  const toggle = (value: string, checked: boolean) => {
    if (single) {
      onChange(checked ? { operator: "is", value } : null);
      return;
    }
    const next = checked
      ? [...selected, value]
      : selected.filter((item) => item !== value);
    onChange(selectRule(next, exclude));
  };

  return (
    <div className="flex flex-col gap-1">
      {options.length > SEARCH_THRESHOLD ? (
        <div className="relative">
          <HugeiconsIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            icon={Search01Icon}
            strokeWidth={2}
          />
          <Input
            aria-label={`Search ${field.label}`}
            autoFocus
            className="h-8 pl-7"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${field.label.toLowerCase()}`}
            value={search}
          />
        </div>
      ) : null}
      <div
        className="-mx-1 max-h-64 overflow-y-auto"
        role={single ? "radiogroup" : undefined}
      >
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-center text-xs">
            No matches
          </p>
        ) : (
          visible.map((option) => {
            const checked = selected.includes(option.value);
            if (single) {
              return (
                <button
                  aria-checked={checked}
                  className="hover:bg-accent flex h-8 w-full items-center gap-2 rounded-md px-2 text-left"
                  key={option.value}
                  onClick={() => toggle(option.value, !checked)}
                  role="radio"
                  type="button"
                >
                  <RadioDot checked={checked} />
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                </button>
              );
            }
            return (
              <button
                aria-checked={checked}
                aria-label={option.label}
                className="hover:bg-accent flex h-8 w-full items-center gap-2 rounded-md px-2 text-left"
                key={option.value}
                onClick={() => toggle(option.value, !checked)}
                role="checkbox"
                type="button"
              >
                <CheckBox checked={checked} />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {counts ? (
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground font-mono text-xs tabular-nums"
                  >
                    {counts.get(option.value) ?? 0}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
      {selected.length > 0 ? (
        <EditorFooter onClear={() => onChange(null)}>
          {single ? null : (
            <button
              className="hover:text-foreground underline decoration-dotted underline-offset-3"
              onClick={() => onChange(selectRule(selected, !exclude))}
              type="button"
            >
              {exclude ? "is none of" : "is any of"}
            </button>
          )}
        </EditorFooter>
      ) : null}
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "border-muted-foreground/50 grid size-4 shrink-0 place-items-center rounded-[4px] border",
        checked && "bg-primary border-primary text-primary-foreground"
      )}
    >
      {checked ? (
        <HugeiconsIcon className="size-3" icon={Tick02Icon} strokeWidth={3} />
      ) : null}
    </span>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "border-muted-foreground/50 size-3.5 shrink-0 rounded-full border",
        checked && "border-primary border-[4.5px]"
      )}
    />
  );
}

function absoluteRange(rule: FilterRule | undefined): [string, string] {
  if (rule?.operator !== "between" || !Array.isArray(rule.value)) {
    return ["", ""];
  }
  const [from, to] = rule.value as { date?: string }[];
  return [from?.date ?? "", to?.date ?? ""];
}

/** Presets ending today, then a custom range. */
export function DateFilterEditor({
  onChange,
  rule,
}: {
  onChange: RuleChange;
  rule: FilterRule | undefined;
}) {
  const preset = matchDatePreset(rule);
  const [initialFrom, initialTo] = absoluteRange(rule);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const custom = Boolean(rule) && !preset;

  const setRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo) {
      const [start, end] =
        nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
      onChange({
        operator: "between",
        value: [{ date: start }, { date: end }],
      });
    }
  };

  return (
    <div className="flex flex-col gap-0.5" role="radiogroup">
      {DATE_PRESETS.map((option) => {
        const checked = preset?.label === option.label;
        return (
          <button
            aria-checked={checked}
            className="hover:bg-accent flex h-8 items-center gap-2 rounded-md px-2 text-left"
            key={option.label}
            onClick={() => onChange(datePresetRule(option))}
            role="radio"
            type="button"
          >
            <RadioDot checked={checked} />
            {option.label}
          </button>
        );
      })}
      <div className="-mx-2.5 my-1 border-t" />
      <span className="text-muted-foreground flex items-center gap-2 px-2 text-xs">
        <RadioDot checked={custom} />
        Custom range
      </span>
      <div className="grid grid-cols-2 gap-1.5 px-0.5 pt-1">
        <Input
          aria-label="From"
          className="h-8 font-mono text-xs"
          onChange={(event) => setRange(event.target.value, to)}
          type="date"
          value={from}
        />
        <Input
          aria-label="To"
          className="h-8 font-mono text-xs"
          onChange={(event) => setRange(from, event.target.value)}
          type="date"
          value={to}
        />
      </div>
      {rule ? <EditorFooter onClear={() => onChange(null)} /> : null}
    </div>
  );
}

const NUMBER_OPERATORS = [
  { label: "At least", value: "gte" },
  { label: "At most", value: "lte" },
  { label: "Exactly", value: "eq" },
] as const;

export function NumberFilterEditor({
  field,
  onChange,
  rule,
}: {
  field: FilterField;
  onChange: RuleChange;
  rule: FilterRule | undefined;
}) {
  const [operator, setOperator] = useState(rule?.operator ?? "gte");
  const [value, setValue] = useState(
    rule?.value === undefined ? "" : String(rule.value)
  );

  const commit = (nextOperator: string, nextValue: string) => {
    const number = Number(nextValue);
    onChange(
      nextValue === "" || !Number.isFinite(number)
        ? null
        : { operator: nextOperator, value: number }
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        className="w-full"
        onValueChange={(next) => {
          const picked = next[0];
          if (picked) {
            setOperator(picked);
            commit(picked, value);
          }
        }}
        size="sm"
        value={[operator]}
        variant="outline"
      >
        {NUMBER_OPERATORS.map((option) => (
          <ToggleGroupItem
            className="flex-1"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Input
        aria-label={field.label}
        autoFocus
        className="h-8 font-mono"
        inputMode="decimal"
        onChange={(event) => {
          setValue(event.target.value);
          commit(operator, event.target.value);
        }}
        placeholder="0"
        type="number"
        value={value}
      />
      {rule ? <EditorFooter onClear={() => onChange(null)} /> : null}
    </div>
  );
}
