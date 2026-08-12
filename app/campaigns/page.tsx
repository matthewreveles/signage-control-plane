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
        description="Schedule playlists, individual assets or adaptive Factory packages."
      >
        <SchemaPendingNotice readiness={readiness} />
      </AdminShell>
    );
  }

  const [campaigns, playlists, assets, creativePackages, screens, groups] = await Promise.all([
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
  ]);

  return (
    <AdminShell
      active="campaigns"
      title="Campaigns"
      description="Schedule playlists, individual assets or adaptive Factory packages."
    >
      <CampaignsPanel
        initialCampaigns={serialize(campaigns)}
        playlists={serialize(playlists)}
        assets={serialize(assets)}
        creativePackages={serialize(creativePackages)}
        screens={serialize(screens)}
        groups={serialize(groups)}
      />
    </AdminShell>
  );
}
