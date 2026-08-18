import AdminShell from "@/components/admin/AdminShell";
import AssetsPanel from "@/components/admin/AssetsPanel";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const assets = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      renditions: true,
      _count: {
        select: {
          playlistItems: true,
          creativeVariants: true,
          contentEntries: true,
          logs: true,
        },
      },
    },
    take: 500,
  });

  return (
    <AdminShell
      active="assets"
      title="Asset Library"
      description="Upload, inspect and manage screen-ready creative assets."
    >
      <AssetsPanel initialAssets={serialize(assets)} />
    </AdminShell>
  );
}
