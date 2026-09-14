/** pg-boss owns only its unsynced schema; Zero's DDL triggers must stay off here. */
export function getJobDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const options = url.searchParams.get("options");
  url.searchParams.set(
    "options",
    [options, "-c event_triggers=off"].filter(Boolean).join(" ")
  );
  return url.toString();
}
