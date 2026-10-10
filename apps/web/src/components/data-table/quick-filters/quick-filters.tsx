import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  FilterHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type {
  FilterField,
  FilterQuery,
  FilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { cn } from "@pi-dash/design-system/lib/utils";
import { type ReactNode, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shared/responsive-sheet";

import {
  DateFilterEditor,
  NumberFilterEditor,
  SelectFilterEditor,
} from "./quick-filter-editors";
import {
  getFieldRule,
  isRuleComplete,
  quickFilterKind,
  setFieldRule,
  summarizeRule,
} from "./quick-filter-model";

export interface QuickFiltersProps {
  /** Per field, how many rows hold each option value. */
  counts?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  fields: readonly FilterField[];
  icons: ReadonlyMap<string, IconSvgElement>;
  onAdvanced?: () => void;
  onQueryChange: (query: FilterQuery) => void;
  /** Field ids shown as placeholders; defaults to two select fields and a date. */
  pinned?: readonly string[];
  query: FilterQuery;
  /** Total rows the current filters leave, for the phone sheet's button. */
  resultCount?: number;
  /** Server-paged tables read one `is` value per select field. */
  single?: boolean;
}

/** Placeholders shown before the rest go under More: a few selects and a date. */
const PINNED_SELECTS = 2;

function defaultPinned(fields: readonly FilterField[]): string[] {
  const selects = fields
    .filter((field) => quickFilterKind(field) === "select")
    .slice(0, PINNED_SELECTS);
  const date = fields.find((field) => quickFilterKind(field) === "date");
  return [...selects, ...(date ? [date] : [])].map((field) => field.id);
}

function FieldEditor({
  counts,
  field,
  onChange,
  rule,
  single,
}: {
  counts?: ReadonlyMap<string, number>;
  field: FilterField;
  onChange: (next: { operator: string; value: unknown } | null) => void;
  rule: FilterRule | undefined;
  single?: boolean;
}) {
  const kind = quickFilterKind(field);
  if (kind === "date") {
    return <DateFilterEditor onChange={onChange} rule={rule} />;
  }
  if (kind === "number") {
    return <NumberFilterEditor field={field} onChange={onChange} rule={rule} />;
  }
  return (
    <SelectFilterEditor
      counts={counts}
      field={field}
      onChange={onChange}
      rule={rule}
      single={single}
    />
  );
}

function FieldIcon({ icon }: { icon?: IconSvgElement }) {
  return icon ? (
    <HugeiconsIcon className="size-3.5 shrink-0" icon={icon} strokeWidth={2} />
  ) : null;
}

/** A dashed placeholder until the field filters something, then a filled chip. */
function FieldChip({
  children,
  field,
  icon,
  onClear,
  onOpenChange,
  open,
  summary,
}: {
  children: ReactNode;
  field: FilterField;
  icon?: IconSvgElement;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  summary: string | null;
}) {
  const active = summary !== null;
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <span
        className={cn(
          "inline-flex h-7 max-w-72 items-center rounded-md text-sm whitespace-nowrap",
          active
            ? "bg-primary/10 text-primary dark:bg-primary/15"
            : "text-muted-foreground border-input hover:text-foreground hover:bg-muted/50 border border-dashed"
        )}
        data-active={active || undefined}
        data-slot="quick-filter"
      >
        <PopoverTrigger
          render={
            <button
              aria-label={
                active
                  ? `${field.label} filter: ${summary}`
                  : `Filter by ${field.label}`
              }
              className="focus-visible:ring-ring/50 flex h-full min-w-0 items-center gap-1.5 rounded-md px-2 font-medium outline-none focus-visible:ring-3"
              type="button"
            />
          }
        >
          <FieldIcon icon={icon} />
          <span className="truncate">
            {active ? `${field.label}: ${summary}` : field.label}
          </span>
        </PopoverTrigger>
        {active ? (
          <button
            aria-label={`Remove ${field.label} filter`}
            className="hover:bg-primary/15 mr-0.5 -ml-1 grid size-5 shrink-0 place-items-center rounded"
            onClick={onClear}
            type="button"
          >
            <HugeiconsIcon
              className="size-3"
              icon={Cancel01Icon}
              strokeWidth={2.4}
            />
          </button>
        ) : null}
      </span>
      <PopoverContent align="start" className="w-64 gap-1.5 p-2.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function QuickFilters({
  counts,
  fields,
  icons,
  onAdvanced,
  onQueryChange,
  pinned,
  query,
  resultCount,
  single,
}: QuickFiltersProps) {
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<string[]>([]);
  const quickFields = fields.filter((field) => quickFilterKind(field));
  const pinnedIds = pinned ?? defaultPinned(quickFields);

  const ruleFor = (field: FilterField) => {
    const rule = getFieldRule(query, field.id);
    return rule && isRuleComplete(rule) ? rule : undefined;
  };
  const change =
    (field: FilterField) =>
    (next: { operator: string; value: unknown } | null) =>
      onQueryChange(setFieldRule(query, field.id, next));
  const activeCount = quickFields.filter(ruleFor).length;
  const clearAll = () => {
    let next = query;
    for (const field of quickFields) {
      next = setFieldRule(next, field.id, null);
    }
    onQueryChange(next);
  };

  if (isMobile) {
    return (
      <QuickFiltersSheet
        activeCount={activeCount}
        clearAll={clearAll}
        counts={counts}
        fields={quickFields}
        icons={icons}
        onChange={change}
        resultCount={resultCount}
        ruleFor={ruleFor}
        single={single}
      />
    );
  }

  const shown = quickFields.filter(
    (field) =>
      pinnedIds.includes(field.id) ||
      promoted.includes(field.id) ||
      ruleFor(field)
  );
  const more = quickFields.filter((field) => !shown.includes(field));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {shown.map((field) => {
        const rule = ruleFor(field);
        return (
          <FieldChip
            field={field}
            icon={icons.get(field.id)}
            key={field.id}
            onClear={() => change(field)(null)}
            onOpenChange={(open) => setOpenId(open ? field.id : null)}
            open={openId === field.id}
            summary={rule ? summarizeRule(field, rule) : null}
          >
            <FieldEditor
              counts={counts?.get(field.id)}
              field={field}
              onChange={change(field)}
              rule={rule}
              single={single}
            />
          </FieldChip>
        );
      })}
      {more.length > 0 || onAdvanced ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="text-muted-foreground border-input hover:text-foreground hover:bg-muted/50 inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-2 text-sm font-medium"
                type="button"
              />
            }
          >
            More
            <HugeiconsIcon
              className="size-3.5"
              icon={ArrowDown01Icon}
              strokeWidth={2}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {more.map((field) => (
              <DropdownMenuItem
                key={field.id}
                onClick={() => {
                  setPromoted((current) => [...current, field.id]);
                  // Open after the menu closes so focus lands in the editor.
                  setTimeout(() => setOpenId(field.id));
                }}
              >
                <FieldIcon icon={icons.get(field.id)} />
                {field.label}
              </DropdownMenuItem>
            ))}
            {onAdvanced ? (
              <>
                {more.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onClick={onAdvanced}>
                  Advanced filters…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {activeCount > 0 ? (
        <Button onClick={clearAll} size="sm" variant="ghost">
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function QuickFiltersSheet({
  activeCount,
  clearAll,
  counts,
  fields,
  icons,
  onChange,
  resultCount,
  ruleFor,
  single,
}: {
  activeCount: number;
  clearAll: () => void;
  counts?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  fields: readonly FilterField[];
  icons: ReadonlyMap<string, IconSvgElement>;
  onChange: (
    field: FilterField
  ) => (next: { operator: string; value: unknown } | null) => void;
  resultCount?: number;
  ruleFor: (field: FilterField) => FilterRule | undefined;
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} />
        Filters
        {activeCount > 0 ? (
          <span className="bg-primary text-primary-foreground grid min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] leading-4">
            {activeCount}
          </span>
        ) : null}
      </Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="gap-0">
          <SheetHeader className="flex-row items-center justify-between">
            <SheetTitle>Filters</SheetTitle>
            {activeCount > 0 ? (
              <Button onClick={clearAll} size="sm" variant="ghost">
                Clear all
              </Button>
            ) : null}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4">
            {fields.map((field) => {
              const rule = ruleFor(field);
              const isOpen = expanded === field.id;
              return (
                <div className="border-b last:border-b-0" key={field.id}>
                  <button
                    aria-expanded={isOpen}
                    className="flex h-12 w-full items-center gap-2.5 text-left"
                    onClick={() => setExpanded(isOpen ? null : field.id)}
                    type="button"
                  >
                    <span className="text-muted-foreground">
                      <FieldIcon icon={icons.get(field.id)} />
                    </span>
                    <span className="font-medium">{field.label}</span>
                    <span
                      className={cn(
                        "ml-auto truncate text-sm",
                        rule
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {rule ? summarizeRule(field, rule) : "Any"}
                    </span>
                    <HugeiconsIcon
                      className={cn(
                        "text-muted-foreground size-4 shrink-0 transition-transform",
                        isOpen && "rotate-90"
                      )}
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                    />
                  </button>
                  {isOpen ? (
                    <div className="pb-3">
                      <FieldEditor
                        counts={counts?.get(field.id)}
                        field={field}
                        onChange={onChange(field)}
                        rule={rule}
                        single={single}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="p-4">
            <Button className="w-full" onClick={() => setOpen(false)} size="lg">
              {resultCount === undefined
                ? "Show results"
                : `Show ${resultCount} ${resultCount === 1 ? "result" : "results"}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
