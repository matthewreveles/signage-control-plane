// app/campaigns/page.tsx
import { prisma } from "@/lib/prisma";
import CampaignsPanel from "@/components/admin/CampaignsPanel";

export const runtime = "nodejs";

function serialize<T>(obj: T): any {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => (v instanceof Date ? v.toISOString() : v))
  );
}

export default async function CampaignsPage() {
  const [campaigns, playlists, assets, screens, groups] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      include: { playlist: true, targets: true },
    }),
    prisma.playlist.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.asset.findMany({
      where: { status: "READY" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.screen.findMany({ orderBy: { screenNumber: "asc" } }),
    prisma.screenGroup.findMany({
      orderBy: { createdAt: "asc" },
      include: { members: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight">Campaigns</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Schedule playlists or single assets over time.
            </p>
          </div>

          <nav className="flex items-center gap-4 text-sm font-medium">
            <a
              href="/"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Screens
            </a>
            <a href="/campaigns" className="text-zinc-900 dark:text-white">
              Campaigns
            </a>
            <a
              href="/content"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Content
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <CampaignsPanel
          initialCampaigns={serialize(campaigns)}
          playlists={serialize(playlists)}
          assets={serialize(assets)}
          screens={serialize(screens)}
          groups={serialize(groups)}
        />
      </main>
    </div>
  );
}