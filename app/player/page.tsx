import PairScreen from "@/components/player/PairScreen";
import SchemaPendingNotice from "@/components/admin/SchemaPendingNotice";
import { getScreenNetworkReadiness } from "@/lib/screen-network-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PairPlayerPage() {
  const readiness = await getScreenNetworkReadiness();

  if (!readiness.ready) {
    return (
      <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-950 dark:bg-black dark:text-zinc-50">
        <div className="mx-auto max-w-4xl">
          <SchemaPendingNotice readiness={readiness} />
        </div>
      </main>
    );
  }

  return <PairScreen />;
}
