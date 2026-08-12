import type { ScreenNetworkReadiness } from "@/lib/screen-network-readiness";

export default function SchemaPendingNotice({
  readiness,
}: {
  readiness: ScreenNetworkReadiness;
}) {
  const databaseUnavailable = readiness.status === "database_unavailable";

  return (
    <section className="card shadow-soft overflow-hidden">
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-5 dark:border-amber-900/70 dark:bg-amber-950/30">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
          Deployment checkpoint
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          {databaseUnavailable
            ? "Database connection unavailable"
            : "Screen Network schema migration required"}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          {databaseUnavailable
            ? "The control plane cannot verify its PostgreSQL connection. Confirm the deployment environment before testing package delivery or player pairing."
            : "The application build is healthy, but the additive proof-of-concept migration has not been applied. Creative packages, authenticated player pairing and idempotent proof-of-play remain deliberately unavailable until the schema checkpoint passes."}
        </p>
      </div>

      <div className="grid gap-5 px-6 py-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Required migration
          </p>
          <code className="mt-2 block w-fit max-w-full overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 text-xs text-emerald-300">
            {readiness.migration}
          </code>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          Readiness endpoint: <code>/api/v1/health</code>
        </div>
      </div>
    </section>
  );
}
