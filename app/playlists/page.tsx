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

  const normalizedWallCreatives = serialize(wallCreatives).map((creative) => ({
    ...creative,
    masterWidth: creative.masterWidth ?? creative.wall.canvasWidth,
    masterHeight: creative.masterHeight ?? creative.wall.canvasHeight,
  }));

  const normalizedPlaylists = serialize(playlists).map((playlist) => ({
    ...playlist,
    items: playlist.items.map((item) => ({
      ...item,
      displayWallCreative: item.displayWallCreative
        ? {
            ...item.displayWallCreative,
            masterWidth:
              item.displayWallCreative.masterWidth ??
              item.displayWallCreative.wall.canvasWidth,
            masterHeight:
              item.displayWallCreative.masterHeight ??
              item.displayWallCreative.wall.canvasHeight,
          }
        : null,
    })),
  }));

  return (
    <AdminShell
      active="playlists"
      title="Playlists"
      description="Build ordered rotations with ordinary screen assets and synchronized wall scenes."
    >
      <PlaylistsPanel
        initialPlaylists={normalizedPlaylists}
        assets={serialize(assets)}
        wallCreatives={normalizedWallCreatives}
      />
    </AdminShell>
  );
}
