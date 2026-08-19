import {
  createFilterQuery,
  createFilterRule,
  isFilterQueryEmpty,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type {
  FilterField,
  FilterNode,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useRef } from "react";
import {
  DATE_FILTER_OPERATORS,
  filterDateValueText,
} from "@/components/data-table/filter-date-editor";
import { useDataTableFilters } from "@/components/data-table/use-data-table-filters";
import { cityOptions } from "@/lib/form-schemas";
import {
  isReimbursement,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/reimbursement-types";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const TYPE_OPTIONS = [
  { label: REQUEST_TYPE_LABELS.reimbursement, value: "reimbursement" },
  { label: REQUEST_TYPE_LABELS.advance_payment, value: "advance_payment" },
];

function computeTotal(lineItems: RequestRow["lineItems"]): number {
  return lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
}

export function getReimbursementFilterValue(
  row: RequestRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "city":
      return row.city;
    case "createdBy":
      return row.userId;
    case "event":
      return isReimbursement(row) ? (row.eventId ?? null) : null;
    case "expenseDate":
      return isReimbursement(row) ? row.expenseDate : null;
    case "status":
      return row.status;
    case "submittedAt":
      return row.submittedAt;
    case "total":
      return computeTotal(row.lineItems);
    case "type":
      return row.type;
    default:
      return;
  }
}

export function createReimbursementFilterFields(
  rows: readonly RequestRow[]
): FilterField[] {
  const users = new Map<string, string>();
  const events = new Map<string, string>();
  for (const row of rows) {
    users.set(row.userId, row.user?.name ?? row.userId);
    if (isReimbursement(row) && row.eventId) {
      events.set(row.eventId, row.event?.name ?? row.eventId);
    }
  }
  const createdByOptions = [...users.entries()].map(([value, label]) => ({
    label,
    value,
  }));
  const eventOptions = [...events.entries()]
    .map(([value, label]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [
    {
      defaultOperator: "is",
      id: "status",
      label: "Status",
      options: STATUS_OPTIONS,
      type: "select",
    },
    {
      defaultOperator: "is",
      id: "type",
      label: "Type",
      options: TYPE_OPTIONS,
      type: "select",
    },
    {
      defaultOperator: "is",
      id: "city",
      label: "City",
      options: cityOptions,
      type: "select",
    },
    {
      defaultOperator: "is",
      id: "event",
      label: "Event",
      options: eventOptions,
      type: "select",
    },
    {
      defaultOperator: "is",
      id: "createdBy",
      label: "Created by",
      options: createdByOptions,
      type: "select",
    },
    {
      defaultOperator: "gte",
      id: "total",
      label: "Total",
      type: "number",
    },
    {
      defaultOperator: "is",
      editor: "date",
      id: "expenseDate",
      label: "Expense date",
      operators: DATE_FILTER_OPERATORS,
      valueText: filterDateValueText,
    },
    {
      defaultOperator: "is",
      editor: "date",
      id: "submittedAt",
      label: "Submitted",
      operators: DATE_FILTER_OPERATORS,
      valueText: filterDateValueText,
    },
  ];
}

export function useMigrateLegacyReimbursementFilterParams() {
  const { query, setQuery } = useDataTableFilters();
  const [status, setStatus] = useQueryState("status", parseAsString);
  const [type, setType] = useQueryState("type", parseAsString);
  const [city, setCity] = useQueryState("city", parseAsString);
  const migrated = useRef(false);

  useEffect(() => {
    if (migrated.current) {
      return;
    }
    if (!isFilterQueryEmpty(query)) {
      migrated.current = true;
      return;
    }

    const rules: FilterNode[] = [];
    if (status) {
      rules.push(
        createFilterRule({
          id: "legacy-status",
          operator: "is",
          path: ["status"],
          value: status,
        })
      );
    }
    if (type) {
      rules.push(
        createFilterRule({
          id: "legacy-type",
          operator: "is",
          path: ["type"],
          value: type,
        })
      );
    }
    if (city) {
      rules.push(
        createFilterRule({
          id: "legacy-city",
          operator: "is",
          path: ["city"],
          value: city,
        })
      );
    }

    migrated.current = true;
    if (rules.length === 0) {
      return;
    }

    setQuery(createFilterQuery(rules));
    setStatus(null);
    setType(null);
    setCity(null);
  }, [city, query, setCity, setQuery, setStatus, setType, status, type]);
}
