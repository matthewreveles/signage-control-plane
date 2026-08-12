import SignagePlayer from "@/components/player/SignagePlayer";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  return <SignagePlayer deviceId={deviceId} />;
}
