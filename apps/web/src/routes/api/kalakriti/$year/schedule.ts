// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { getKalakritiPublicSchedule } from "@pi-dash/db/queries/kalakriti-public-schedule";
import { createFileRoute } from "@tanstack/react-router";
import {
  kalakritiPublicScheduleSchema,
  kalakritiPublicScheduleYearSchema,
} from "@/lib/kalakriti-public-schedule";

export interface PublicScheduleHandlerDeps {
  getSchedule: (year: number) => Promise<unknown | null>;
}

const defaultHandlerDeps: PublicScheduleHandlerDeps = {
  getSchedule: getKalakritiPublicSchedule,
};

export async function handlePublicScheduleRequest(
  yearParam: string,
  deps = defaultHandlerDeps
): Promise<Response> {
  const result = kalakritiPublicScheduleYearSchema.safeParse(yearParam);
  if (!result.success) {
    return Response.json({ error: "Invalid year" }, { status: 400 });
  }

  const schedule = await deps.getSchedule(result.data);
  if (!schedule) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  return Response.json(kalakritiPublicScheduleSchema.parse(schedule), {
    headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}

export const Route = createFileRoute("/api/kalakriti/$year/schedule")({
  server: {
    handlers: {
      GET: ({ params }) => handlePublicScheduleRequest(params.year),
    },
  },
});
