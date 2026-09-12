interface KalakritiFoodOperation {
  type: string;
  supersededByOperationId: string | null;
}

export function getKalakritiFoodStatus({
  kind,
  operations,
  state,
}: {
  kind: "student" | "volunteer" | "guardian";
  operations: readonly KalakritiFoodOperation[];
  state?: "active" | "archived";
}) {
  const effective = new Set(
    operations
      .filter((operation) => operation.supersededByOperationId === null)
      .map((operation) => operation.type)
  );
  const checkedIn = effective.has("volunteer_check_in");
  return {
    eligible:
      kind === "student"
        ? effective.has("pickup")
        : state === "active" && (kind === "guardian" || checkedIn),
    breakfastServed: effective.has("breakfast"),
    lunchServed: effective.has("lunch"),
    checkedIn,
    arrived: effective.has("venue_arrival"),
  };
}
