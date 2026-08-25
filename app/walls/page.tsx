import AdminShell from "@/components/admin/AdminShell";
import DisplayWallsPanel from "@/components/admin/DisplayWallsPanel";
import SchemaPendingNotice from "@/components/admin/SchemaPendingNotice";
import { prisma } from "@/lib/prisma";
import { getScreenNetworkReadiness } from "@/lib/screen-network-readiness";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DisplayWallsPage() {
  const readiness = await getScreenNetworkReadiness();

  if (!readiness.ready) {
    return (
      <AdminShell
        active="walls"
        title="Display walls"
        description="Combine physical screens into synchronized logical canvases."
      >
        <SchemaPendingNotice readiness={readiness} />
      </AdminShell>
    );
  }

  const [walls, screens] = await Promise.all([
    prisma.displayWall.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          orderBy: { slotIndex: "asc" },
          include: {
            screen: {
              select: {
                id: true,
                screenNumber: true,
                name: true,
                deviceId: true,
                orientation: true,
                width: true,
                height: true,
                lastSeenAt: true,
              },
            },
          },
        },
        _count: {
          select: {
            creatives: true,
            campaignTargets: true,
            schedules: true,
          },
        },
      },
    }),
    prisma.screen.findMany({
      orderBy: { screenNumber: "asc" },
      select: {
        id: true,
        screenNumber: true,
        name: true,
        deviceId: true,
        orientation: true,
        width: true,
        height: true,
        lastSeenAt: true,
      },
    }),
  ]);

  return (
    <AdminShell
      active="walls"
      title="Display walls"
      description="Map screens in physical order and expose one logical canvas for shared creative."
    >
      <DisplayWallsPanel
        initialWalls={serialize(walls)}
        screens={serialize(screens)}
      />
    </AdminShell>
  );
}
