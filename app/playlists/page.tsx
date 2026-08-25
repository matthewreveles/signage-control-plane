import AdminShell from "@/components/admin/AdminShell";
import PlaylistsPanel from "@/components/admin/PlaylistsPanel";
import SchemaPendingNotice from "@/components/admin/SchemaPendingNotice";
import { prisma } from "@/lib/prisma";
import { getScreenNetworkReadiness } from "@/lib/screen-network-readiness";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const readiness = await getScreenNetworkReadiness();

  if (!readiness.ready) {
    return (
      <AdminShell
        active="playlists"
        title="Playlists"
        description="Build ordered screen rotations, including synchronized wall scenes."
      >
        <SchemaPendingNotice readiness={readiness} />
      </AdminShell>
    );
  }

  const [playlists, assets, wallCreatives] = await Promise.all([
    prisma.playlist.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            asset: true,
            displayWallCreative: { include: { wall: true } },
          },
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

    prisma.displayWallCreative.findMany({
      where: { status: "READY" },
      orderBy: { createdAt: "desc" },
      include: { wall: true },
      take: 500,
    }),
  ]);

  return (
    <AdminShell
      active="playlists"
      title="Playlists"
      description="Build ordered rotations with ordinary screen assets and synchronized wall scenes."
    >
      <PlaylistsPanel
        initialPlaylists={serialize(playlists)}
        assets={serialize(assets)}
        wallCreatives={serialize(wallCreatives)}
      />
    </AdminShell>
  );
}
