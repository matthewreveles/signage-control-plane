import AdminShell from "@/components/admin/AdminShell";
import PlaylistsPanel from "@/components/admin/PlaylistsPanel";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const [playlists, assets] = await Promise.all([
    prisma.playlist.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { asset: true },
        },
      },
    }),

    prisma.asset.findMany({
      where: {
        status: "READY",
        type: "IMAGE",
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  return (
    <AdminShell
      active="playlists"
      title="Playlists"
      description="Build ordered screen rotations, control timing and schedule them as campaigns."
    >
      <PlaylistsPanel
        initialPlaylists={serialize(playlists)}
        assets={serialize(assets)}
      />
    </AdminShell>
  );
}
