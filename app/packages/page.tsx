import AdminShell from "@/components/admin/AdminShell";
import CreativePackagesPanel from "@/components/admin/CreativePackagesPanel";
import { CREATIVE_PRESETS } from "@/lib/creative-packages";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const packages = await prisma.creativePackage.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      variants: {
        orderBy: [{ destination: "asc" }, { width: "desc" }],
        include: { asset: true },
      },
    },
  });

  return (
    <AdminShell
      active="packages"
      title="Creative packages"
      description="Receive AI Factory packages, review every output and release them to screens."
    >
      <CreativePackagesPanel
        initialPackages={serialize(packages)}
        presets={serialize(CREATIVE_PRESETS)}
      />
    </AdminShell>
  );
}
