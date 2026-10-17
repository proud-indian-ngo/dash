import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { getTrusteeAccountOptions } from "@/functions/governance";

/** Active accounts, for owners and policy audiences; `governance.manage` only. */
export function useAccountOptions(enabled: boolean) {
  const load = useServerFn(getTrusteeAccountOptions);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    load()
      .then((rows) =>
        setAccounts(rows.map((r) => ({ id: r.id, name: r.name })))
      )
      .catch(() => undefined);
  }, [enabled, load]);
  return accounts;
}
