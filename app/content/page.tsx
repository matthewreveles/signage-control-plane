// app/content/page.tsx
import { prisma } from "@/lib/prisma";
import ContentPanel from "@/components/admin/ContentPanel";

export const runtime = "nodejs";

function serialize<T>(obj: T): any {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => (v instanceof Date ? v.toISOString() : v))
  );
}

export default async function ContentPage() {
  const [collections, assets] = await Promise.all([
    prisma.contentCollection.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        entries: {
          orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
          take: 200,
        },
      },
    }),
    prisma.asset.findMany({
      where: { status: "READY" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, type: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight">Content</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Collections + entries with approvals and time windows.
            </p>
          </div>

          <nav className="flex items-center gap-4 text-sm font-medium">
            <a
              href="/"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Screens
            </a>
            <a
              href="/campaigns"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Campaigns
            </a>
            <a
              href="/content"
              className="text-zinc-900 dark:text-white"
            >
              Content
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <ContentPanel
          initialCollections={serialize(collections)}
          assets={serialize(assets)}
        />
      </main>
    </div>
  );
}