export function ScheduleNotFound() {
  return (
    <main className="bg-background text-foreground grid min-h-svh place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="text-muted-foreground text-sm font-medium tracking-[0.16em] uppercase">
          Kalakriti
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Schedule not available
        </h1>
        <p className="text-muted-foreground mt-2">
          This edition does not have a public schedule yet. Check the year in
          the address or try again later.
        </p>
      </div>
    </main>
  );
}
