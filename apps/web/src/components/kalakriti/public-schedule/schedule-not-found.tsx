export function ScheduleNotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.16em]">
          Kalakriti
        </p>
        <h1 className="mt-3 font-semibold text-2xl tracking-tight">
          Schedule not available
        </h1>
        <p className="mt-2 text-muted-foreground">
          This edition does not have a public schedule yet. Check the year in
          the address or try again later.
        </p>
      </div>
    </main>
  );
}
