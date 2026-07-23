/**
 * A quiet skeleton for pages waiting on their first load — pulsing hairline
 * blocks in place of the old bare "…", so the shape of what's coming is felt.
 */
export function Loading({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 h-8 w-1/3 rounded bg-edge/60" />
      <div className="space-y-3.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="h-4 flex-1 rounded bg-edge/50" />
            <div className="h-4 w-16 rounded bg-edge/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
