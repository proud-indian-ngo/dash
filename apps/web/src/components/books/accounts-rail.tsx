import { cn } from "@pi-dash/design-system/lib/utils";
import { formatPaise } from "@pi-dash/shared/money";

import { Tag } from "@/components/shared/status-badge";

import { ACCOUNT_KIND_LABELS } from "./use-books";

export interface RailAccount {
  active: boolean;
  balancePaise: number;
  id: string;
  kind: string;
  name: string;
}

/** The trust's accounts with their balances; picking one shows its cash book. */
export function AccountsRail({
  accounts,
  onSelect,
  selectedId,
}: {
  accounts: readonly RailAccount[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <nav aria-label="Accounts" data-testid="books-accounts">
      {/* Phones: one swipeable row of cards bleeding to the screen edge, like
          the stat chips. Cards above the books on mid screens; a rail beside
          them on wide ones. */}
      <ul className="flex [scrollbar-width:none] gap-2 overflow-x-auto max-sm:-mx-2 max-sm:px-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:block xl:gap-0 xl:divide-y xl:rounded-lg xl:border [&::-webkit-scrollbar]:hidden">
        {accounts.map((account) => {
          const selected = account.id === selectedId;
          return (
            <li
              className="rounded-lg border max-sm:w-64 max-sm:shrink-0 xl:rounded-none xl:border-0"
              key={account.id}
            >
              <button
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "hover:bg-muted/60 flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm first:rounded-t-lg last:rounded-b-lg",
                  selected &&
                    "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent"
                )}
                data-testid="books-account"
                onClick={() => onSelect(account.id)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {account.name}
                  </span>
                  <span className="mt-1 flex gap-1">
                    <Tag>
                      {ACCOUNT_KIND_LABELS[account.kind] ?? account.kind}
                    </Tag>
                    {account.active ? null : <Tag>Inactive</Tag>}
                  </span>
                </span>
                <span
                  className="shrink-0 font-mono tabular-nums"
                  data-testid="books-account-balance"
                >
                  {formatPaise(account.balancePaise)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
