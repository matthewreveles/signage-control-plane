// app/content/page.tsx
import { prisma } from "@/lib/prisma";
import ContentPanel from "@/components/admin/ContentPanel";
import AdminShell from "@/components/admin/AdminShell";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const [collections, assets] = await Promise.all([
    prisma.contentCollection.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        entries: {
          orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
          take: 200,
        },
      },
    }),
    prisma.asset.findMany({
      where: { status: "READY" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, type: true },
    }),
  ]);

  return (
    <AdminShell
      active="content"
      title="Content"
      description="Manage structured feeds, approvals and time-sensitive screen content."
    >
      <ContentPanel
        initialCollections={serialize(collections)}
        assets={serialize(assets)}
      />
    </AdminShell>
  );
}
