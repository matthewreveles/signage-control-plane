"use client";

import { useEffect, useMemo, useState } from "react";

type WallRef = { id: string; name: string };

type WallStatus = {
  generatedAt: string;
  wall: {
    id: string;
    name: string;
    rows: number;
    columns: number;
    canvasWidth: number;
    canvasHeight: number;
    syncToleranceMs: number;
    hardResyncMs: number;
    requireAllMembersReady: boolean;
    failurePolicy: "HOLD_LAST_READY" | "FALLBACK_STANDARD";
  };
  run: {
    id: string;
    campaignId: string;
    campaignName: string;
    occurrenceKey: string;
    manifestVersion: string;
    status: "PREPARING" | "ARMED" | "RUNNING" | "BLOCKED" | "COMPLETE";
    releaseAt: string | null;
    blockedReason: string | null;
    updatedAt: string;
  } | null;
  summary: {
    memberCount: number;
    onlineCount: number;
    telemetryFreshCount: number;
    readyCount: number;
    failedCount: number;
    cacheReadyCount: number;
    localFileCount: number;
    browserCacheCount: number;
    networkCount: number;
    worstDriftMs: number | null;
    sourceFailovers: number;
    hardResyncs: number;
    sceneMode: "SPAN" | "INDEPENDENT" | "MIXED" | null;
  };
  members: Array<{
    slotIndex: number;
    row: number;
    column: number;
    screen: {
      id: string;
      screenNumber: number;
      name: string;
      deviceId: string | null;
      online: boolean;
      lastSeenAt: string | null;
    };
    readiness: {
      status: "PRELOADING" | "READY" | "FAILED";
      manifestCurrent: boolean;
      error: string | null;
      cachedAt: string | null;
      observedAt: string;
    } | null;
    telemetry: {
      fresh: boolean;
      sceneMode: "SPAN" | "INDEPENDENT" | null;
      currentItemIndex: number | null;
      currentAsset: { id: string; name: string; type: "IMAGE" | "VIDEO" } | null;
      driftMs: number | null;
      clockOffsetMs: number | null;
      correctionMode: "NONE" | "SOFT" | "HARD";
      transport: "LOCAL_FILE" | "BROWSER_CACHE" | "NETWORK";
      cacheReady: boolean;
      cachedAssets: number;
      cacheBytesMb: number;
      storageFreeMb: number | null;
      sourceFailovers: number;
      hardResyncs: number;
      playerVersion: string | null;
      lastError: string | null;
      observedAt: string;
    } | null;
  }>;
};

function statusTone(status: WallStatus["run"] extends infer R ? string : never) {
  if (status === "RUNNING" || status === "ARMED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "BLOCKED") return "border-red-200 bg-red-50 text-red-800";
  if (status === "PREPARING") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function memberTone(member: WallStatus["members"][number], toleranceMs: number) {
  if (!member.screen.online || !member.telemetry?.fresh) return "border-zinc-300 bg-zinc-50";
  if (member.readiness?.status === "FAILED" || member.telemetry.lastError) return "border-red-300 bg-red-50";
  if (
    member.telemetry.driftMs !== null &&
    Math.abs(member.telemetry.driftMs) > toleranceMs
  ) {
    return "border-amber-300 bg-amber-50";
  }
  if (member.telemetry.transport === "LOCAL_FILE" && member.telemetry.cacheReady) {
    return "border-emerald-300 bg-emerald-50";
  }
  return "border-blue-200 bg-blue-50";
}

export default function WallOperationsOverview({ walls }: { walls: WallRef[] }) {
  const [statuses, setStatuses] = useState<Record<string, WallStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(walls[0]?.id ?? null);

  const wallKey = useMemo(() => walls.map((wall) => wall.id).join("|"), [walls]);

  useEffect(() => {
    if (!walls.length) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      const results = await Promise.all(
        walls.map(async (wall) => {
          try {
            const response = await fetch(`/api/admin/display-walls/${wall.id}/status`, {
              cache: "no-store",
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return { id: wall.id, status: (await response.json()) as WallStatus, error: null };
          } catch (error) {
            return {
              id: wall.id,
              status: null,
              error: error instanceof Error ? error.message : "Status unavailable",
            };
          }
        }),
      );

      if (cancelled) return;

      setStatuses((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status) next[result.id] = result.status;
        }
        return next;
      });
      setErrors(() => {
        const next: Record<string, string> = {};
        for (const result of results) {
          if (result.error) next[result.id] = result.error;
        }
        return next;
      });

      timeout = setTimeout(refresh, 5_000);
    }

    void refresh();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [wallKey]);

  if (!walls.length) return null;

  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Cluster operations
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Live wall health</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Readiness, playback source, synchronization and device health refresh every 5 seconds.
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          Green member = cached locally and healthy · blue = cache/network-backed · amber = drift · red = fault
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {walls.map((wallRef) => {
          const status = statuses[wallRef.id];
          const error = errors[wallRef.id];
          const expanded = expandedId === wallRef.id;

          if (!status) {
            return (
              <div key={wallRef.id} className="rounded-xl border border-zinc-200 p-4">
                <div className="font-semibold">{wallRef.name}</div>
                <div className="mt-2 text-sm text-zinc-500">
                  {error ? `Status unavailable: ${error}` : "Loading cluster telemetry…"}
                </div>
              </div>
            );
          }

          const { summary, run } = status;
          const fullyLocal =
            summary.memberCount > 0 && summary.localFileCount === summary.memberCount;
          const readinessComplete =
            summary.memberCount > 0 && summary.readyCount === summary.memberCount;
          const driftHealthy =
            summary.worstDriftMs === null || summary.worstDriftMs <= status.wall.syncToleranceMs;

          return (
            <div key={wallRef.id} className="overflow-hidden rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : wallRef.id)}
                className="block w-full p-4 text-left hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{status.wall.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {status.wall.rows}×{status.wall.columns} · {status.wall.canvasWidth.toLocaleString()}×{status.wall.canvasHeight.toLocaleString()} canvas
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(run?.status ?? "IDLE")}`}>
                    {run?.status ?? "IDLE"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniMetric label="Online" value={`${summary.onlineCount}/${summary.memberCount}`} good={summary.onlineCount === summary.memberCount} />
                  <MiniMetric label="Ready" value={`${summary.readyCount}/${summary.memberCount}`} good={readinessComplete} />
                  <MiniMetric label="Local files" value={`${summary.localFileCount}/${summary.memberCount}`} good={fullyLocal} />
                  <MiniMetric
                    label="Worst drift"
                    value={summary.worstDriftMs === null ? "—" : `${summary.worstDriftMs} ms`}
                    good={driftHealthy}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                  <span>Scene: <strong>{summary.sceneMode ?? "idle"}</strong></span>
                  <span>Fresh telemetry: <strong>{summary.telemetryFreshCount}/{summary.memberCount}</strong></span>
                  <span>Cache-ready: <strong>{summary.cacheReadyCount}/{summary.memberCount}</strong></span>
                  <span>Failovers: <strong>{summary.sourceFailovers}</strong></span>
                  <span>Hard resyncs: <strong>{summary.hardResyncs}</strong></span>
                </div>

                {run?.blockedReason ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                    {run.blockedReason}
                  </div>
                ) : null}
              </button>

              {expanded ? (
                <div className="border-t border-zinc-200 bg-zinc-50 p-4">
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(1, status.wall.columns)}, minmax(130px, 1fr))`,
                      minWidth: `${Math.max(1, status.wall.columns) * 140}px`,
                    }}
                  >
                    {status.members.map((member) => (
                      <div
                        key={member.screen.id}
                        className={`rounded-lg border p-3 ${memberTone(member, status.wall.syncToleranceMs)}`}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Slot {member.slotIndex + 1}
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold">
                          {member.screen.name}
                        </div>
                        <div className="mt-2 space-y-1 text-[11px] text-zinc-600">
                          <div>{member.screen.online ? "online" : "offline"} · {member.telemetry?.playerVersion ?? "player unknown"}</div>
                          <div>
                            {member.telemetry?.transport ?? "no telemetry"} · {member.telemetry?.cacheReady ? "cache ready" : "cache pending"}
                          </div>
                          <div>
                            drift {member.telemetry?.driftMs === null || member.telemetry?.driftMs === undefined ? "—" : `${member.telemetry.driftMs} ms`} · {member.telemetry?.correctionMode ?? "NONE"}
                          </div>
                          <div>
                            {member.telemetry?.sceneMode ?? "idle"} · {member.telemetry?.currentAsset?.name ?? "no active asset"}
                          </div>
                        </div>
                        {member.telemetry?.lastError || member.readiness?.error ? (
                          <div className="mt-2 text-[11px] font-medium text-red-700">
                            {member.telemetry?.lastError ?? member.readiness?.error}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] text-zinc-500">
                    LOCAL_FILE is the production-safe state: scheduled media is playing from persistent device storage, so WAN latency is outside the active playback path.
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MiniMetric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${good ? "text-emerald-700" : "text-zinc-900"}`}>
        {value}
      </div>
    </div>
  );
}
