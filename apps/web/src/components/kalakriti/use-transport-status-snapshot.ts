import { useEffect, useMemo, useState } from "react";

interface TransportStatusSnapshot {
  scopeKey: string;
  labels: ReadonlyMap<string, string>;
}

export function resolveTransportStatusSnapshot(
  previous: TransportStatusSnapshot | undefined,
  current: TransportStatusSnapshot,
  complete: boolean
): TransportStatusSnapshot | undefined {
  if (complete) return current;
  return previous?.scopeKey === current.scopeKey ? previous : undefined;
}

// Only transport labels wait for an authoritative initial snapshot; base rows stay visible.
export function useTransportStatusSnapshot<T extends { id: string }>({
  data,
  scopeKey,
  complete,
  getStatus,
}: {
  data: T[];
  scopeKey: string;
  complete: boolean;
  getStatus: (row: T) => string;
}) {
  const current = useMemo(
    () => ({
      scopeKey,
      labels: new Map(data.map((row) => [row.id, getStatus(row)])),
    }),
    [data, getStatus, scopeKey]
  );
  const [previous, setPrevious] = useState<TransportStatusSnapshot>();
  const snapshot = resolveTransportStatusSnapshot(previous, current, complete);
  useEffect(() => {
    if (complete) setPrevious(current);
  }, [complete, current]);
  return {
    labels: snapshot?.labels,
    pending: data.some((row) => !snapshot?.labels.has(row.id)),
  };
}
