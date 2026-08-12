// app/page.tsx
import { prisma } from "@/lib/prisma";
import ScreensPanel from "@/components/admin/ScreensPanel";
import AdminShell from "@/components/admin/AdminShell";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      logs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
          asset: { select: { name: true } },
        },
      },
      _count: { select: { logs: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <AdminShell
      active="screens"
      title="Screens"
      description="Pair devices, set display geometry and watch network health."
    >
      <ScreensPanel initialScreens={serialize(screens)} />
    </AdminShell>
  );
}
