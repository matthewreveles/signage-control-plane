// app/campaigns/page.tsx
import { prisma } from "@/lib/prisma";
import CampaignsPanel from "@/components/admin/CampaignsPanel";
import AdminShell from "@/components/admin/AdminShell";
import SchemaPendingNotice from "@/components/admin/SchemaPendingNotice";
import { getScreenNetworkReadiness } from "@/lib/screen-network-readiness";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const readiness = await getScreenNetworkReadiness();

  if (!readiness.ready) {
    return (
      <AdminShell
        active="campaigns"
        title="Campaigns"
        description="Schedule playlists, individual assets, adaptive packages or synchronized wall scenes."
      >
        <SchemaPendingNotice readiness={readiness} />
      </AdminShell>
    );
  }

  const [
    campaigns,
    playlists,
    assets,
    creativePackages,
    screens,
    groups,
    walls,
    wallCreatives,
  ] = await Promise.all([
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
    prisma.creativePackage.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      include: { variants: true },
      take: 100,
    }),
    prisma.screen.findMany({ orderBy: { screenNumber: "asc" } }),
    prisma.screenGroup.findMany({
      orderBy: { createdAt: "asc" },
      include: { members: true },
    }),
    prisma.displayWall.findMany({
      orderBy: { createdAt: "asc" },
      include: { members: true },
    }),
    prisma.displayWallCreative.findMany({
      where: { status: "READY" },
      orderBy: { createdAt: "desc" },
      include: { wall: { include: { members: true } } },
      take: 100,
    }),
  ]);

  const campaignWallCreatives = serialize(wallCreatives).map((creative) => ({
    ...creative,
    // UI geometry describes the logical cluster canvas. A physical encoded
    // monolithic master is optional and may not exist for very wide walls.
    masterWidth: creative.masterWidth ?? creative.wall.canvasWidth,
    masterHeight: creative.masterHeight ?? creative.wall.canvasHeight,
  }));

  return (
    <AdminShell
      active="campaigns"
      title="Campaigns"
      description="Schedule playlists and shared wall scenes against individual screens, groups or synchronized display walls."
    >
      <CampaignsPanel
        initialCampaigns={serialize(campaigns)}
        playlists={serialize(playlists)}
        assets={serialize(assets)}
        creativePackages={serialize(creativePackages)}
        screens={serialize(screens)}
        groups={serialize(groups)}
        walls={serialize(walls)}
        wallCreatives={campaignWallCreatives}
      />
    </AdminShell>
  );
}
