// app/page.tsx
import { prisma } from "@/lib/prisma";
import ScreensPanel from "@/components/admin/ScreensPanel";

export const runtime = "nodejs";

export default async function Home() {
  const screens = await prisma.screen.findMany({
    orderBy: { screenNumber: "asc" },
    select: {
      id: true,
      screenNumber: true,
      name: true,
      deviceId: true,
      activationCode: true,
      orientation: true,
      width: true,
      height: true,
      timezone: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight">
              Signage Control Plane
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Screens, playlists, schedules, proof-of-play.
            </p>
          </div>

          <nav className="flex items-center gap-4 text-sm font-medium">
            <a href="/" className="text-zinc-900 dark:text-white">Screens</a>
            <a
              href="/campaigns"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
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
        <ScreensPanel initialScreens={screens as any} />
      </main>
    </div>
  );
}