const DEFAULT_DURATION_MS = 10_000;
const INVARIANT_PROJECT = "kalakriti_release_invariants";
const TEST_LINE = /^\[([^\]\s]+)\] › ([^›\n]+\.ts):(\d+):(\d+) › (\S.*)$/;

type Partition = { lines: string[]; totalMs: number; invariantMs: number };
type SpecGroup = Partition & { spec: string; isInvariant: boolean };

function normalizedKey(line: string): string {
  return line.replace(/:\d+:\d+(?= › )/, "");
}

function validDuration(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

/** Assign complete spec files to two isolated E2E stacks. */
export function partitionSpecs(
  lines: string[],
  durations: Record<string, number>
): [Partition, Partition] {
  const normalizedDurations = new Map<string, number>();
  for (const [key, duration] of Object.entries(durations).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    if (validDuration(duration)) {
      const normalized = normalizedKey(key);
      if (!normalizedDurations.has(normalized)) {
        normalizedDurations.set(normalized, duration);
      }
    }
  }

  const groups = new Map<string, SpecGroup>();
  const seen = new Set<string>();
  for (const line of lines) {
    const match = TEST_LINE.exec(line);
    if (!match) {
      throw new Error(`Invalid Playwright test-list row: ${line}`);
    }
    const [, project, spec] = match;
    if (project === "setup") continue;
    if (!spec.endsWith(".spec.ts")) {
      throw new Error(`Invalid Playwright test-list row: ${line}`);
    }
    if (seen.has(line)) {
      throw new Error(`Duplicate Playwright test-list row: ${line}`);
    }
    seen.add(line);

    let group = groups.get(spec);
    if (!group) {
      group = {
        spec,
        lines: [],
        totalMs: 0,
        invariantMs: 0,
        isInvariant: false,
      };
      groups.set(spec, group);
    }
    const exact = durations[line];
    const duration = validDuration(exact)
      ? exact
      : (normalizedDurations.get(normalizedKey(line)) ?? DEFAULT_DURATION_MS);
    group.lines.push(line);
    group.totalMs += duration;
    if (project === INVARIANT_PROJECT) {
      group.isInvariant = true;
      group.invariantMs += duration;
    }
  }

  const partitions: [Partition, Partition] = [
    { lines: [], totalMs: 0, invariantMs: 0 },
    { lines: [], totalMs: 0, invariantMs: 0 },
  ];
  const bySpec = (a: SpecGroup, b: SpecGroup) =>
    a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0;
  const invariantGroups = [...groups.values()]
    .filter((group) => group.isInvariant)
    .sort(
      (a, b) =>
        b.invariantMs - a.invariantMs || b.totalMs - a.totalMs || bySpec(a, b)
    );
  const otherGroups = [...groups.values()]
    .filter((group) => !group.isInvariant)
    .sort((a, b) => b.totalMs - a.totalMs || bySpec(a, b));

  for (const group of [...invariantGroups, ...otherGroups]) {
    const first = partitions[0];
    const second = partitions[1];
    const target = group.isInvariant
      ? first.invariantMs < second.invariantMs ||
        (first.invariantMs === second.invariantMs &&
          first.totalMs <= second.totalMs)
        ? first
        : second
      : first.totalMs <= second.totalMs
        ? first
        : second;
    target.lines.push(...group.lines);
    target.totalMs += group.totalMs;
    target.invariantMs += group.invariantMs;
  }

  return partitions;
}
