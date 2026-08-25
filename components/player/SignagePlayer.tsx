"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  clockSample,
  driftCorrection,
  expectedWallPosition,
  monotonicEpochNowMs,
  stableServerClockOffsetMs,
  type ClockSample,
} from "@/lib/wall-sync";

type AssetItem = {
  kind: "ASSET";
  sourceKind: "ASSET" | "CREATIVE_PACKAGE" | "DISPLAY_WALL";
  assetId: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  width: number | null;
  height: number | null;
  durationSeconds: number;
  packageId?: string;
  packageName?: string;
  brand?: string;
  variantId?: string;
  presetKey?: string;
  sceneMode?: "SPAN" | "INDEPENDENT";
  wallId?: string;
  wallCreativeId?: string;
  wallCreativeName?: string;
  slotIndex?: number;
};

type CollectionItem = {
  kind: "COLLECTION_WIDGET";
  collectionId: string;
  renderMode: "TICKER" | "LIST" | "GRID";
  feedUrl: string;
  durationSeconds: number;
};

type SyncGapItem = {
  kind: "SYNC_GAP";
  durationSeconds: number;
  reason: string;
};

type PlaylistItem = AssetItem | CollectionItem | SyncGapItem;

type WallSync = {
  mode: "DISPLAY_WALL";
  wallId: string;
  wallName: string;
  epochMs: number;
  serverNowMs: number;
  toleranceMs: number;
  hardResyncMs: number;
  failurePolicy: "HOLD_LAST_READY" | "FALLBACK_STANDARD";
  manifestVersion: string | null;
  canvasWidth: number;
  canvasHeight: number;
  member: {
    slotIndex: number;
    row: number;
    column: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

type WallPreloadPlan = {
  wallId: string;
  wallName: string;
  campaignId: string;
  occurrenceKey: string;
  manifestVersion: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  releaseAt: string | null;
  runStatus: "PREPARING" | "ARMED" | "RUNNING" | "BLOCKED" | "COMPLETE";
  failurePolicy: "HOLD_LAST_READY" | "FALLBACK_STANDARD";
  requireAllMembersReady: boolean;
  assets: Array<{
    assetId: string;
    url: string;
    type: "IMAGE" | "VIDEO";
    sourceKind: "ASSET" | "CREATIVE_PACKAGE" | "DISPLAY_WALL";
    sceneMode: "SPAN" | "INDEPENDENT" | null;
  }>;
};

type PlaylistResponse = {
  device: {
    deviceId: string;
    screenNumber: number;
    name: string;
    label: string;
    orientation: "LANDSCAPE" | "PORTRAIT";
    width: number;
    height: number;
    timezone: string;
  };
  generatedAt: string;
  pollSeconds: number;
  preload: WallPreloadPlan | null;
  sync: WallSync | null;
  items: PlaylistItem[];
};

type ProofEvent = {
  playbackId: string;
  assetId: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
};

function headers(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function proofQueueKey(deviceId: string) {
  return `gspan-proof-queue:${deviceId}`;
}

function readProofQueue(deviceId: string): ProofEvent[] {
  try {
    return JSON.parse(window.localStorage.getItem(proofQueueKey(deviceId)) ?? "[]");
  } catch {
    return [];
  }
}

function writeProofQueue(deviceId: string, events: ProofEvent[]) {
  window.localStorage.setItem(proofQueueKey(deviceId), JSON.stringify(events.slice(-500)));
}

async function sendProof(deviceId: string, token: string, events: ProofEvent[]) {
  if (!events.length) return true;
  const response = await fetch(`/api/v1/screens/${encodeURIComponent(deviceId)}/proof-of-play`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  return response.ok;
}

function itemKey(item: PlaylistItem | null, index: number) {
  if (!item) return "empty";
  if (item.kind === "ASSET") {
    return `${index}:asset:${item.assetId}:${item.url}`;
  }
  if (item.kind === "COLLECTION_WIDGET") {
    return `${index}:collection:${item.collectionId}`;
  }
  return `${index}:gap:${item.reason}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function consumeResponse(response: Response) {
  if (!response.body) {
    await response.arrayBuffer();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) return;
  }
}

async function verifyImage(url: string) {
  const image = new window.Image();
  image.decoding = "async";
  image.src = url;

  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image decode failed"));
  });
}

async function verifyVideo(url: string) {
  await new Promise<void>((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Video metadata/decode readiness failed"));
    };

    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.addEventListener("loadeddata", succeed, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.src = url;
    video.load();

    window.setTimeout(fail, 20_000);
  });
}

async function preloadAsset(asset: WallPreloadPlan["assets"][number]) {
  const response = await fetch(asset.url, { cache: "force-cache" });
  if (!response.ok && response.type !== "opaque") {
    throw new Error(`Asset preload returned HTTP ${response.status}`);
  }

  await consumeResponse(response);

  if (asset.type === "VIDEO") {
    await verifyVideo(asset.url);
  } else {
    await verifyImage(asset.url);
  }
}

async function reportWallReadiness({
  deviceId,
  token,
  preload,
  status,
  error,
}: {
  deviceId: string;
  token: string;
  preload: WallPreloadPlan;
  status: "PRELOADING" | "READY" | "FAILED";
  error?: string;
}) {
  const response = await fetch(
    `/api/v1/screens/${encodeURIComponent(deviceId)}/wall-readiness`,
    {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        wallId: preload.wallId,
        campaignId: preload.campaignId,
        occurrenceKey: preload.occurrenceKey,
        manifestVersion: preload.manifestVersion,
        status,
        error: error ?? null,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Readiness acknowledgement failed: ${response.status}`);
  }

  return response.json();
}

export default function SignagePlayer({ deviceId }: { deviceId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [lastReadyAsset, setLastReadyAsset] = useState<AssetItem | null>(null);
  const [connection, setConnection] = useState<
    "CONNECTING" | "ONLINE" | "OFFLINE" | "UNPAIRED"
  >("CONNECTING");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clockSamplesRef = useRef<ClockSample[]>([]);
  const preloadVersionRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(`gspan-screen-token:${deviceId}`);
    setToken(stored);
    if (!stored) setConnection("UNPAIRED");
  }, [deviceId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const requestStartedAtMs = monotonicEpochNowMs();

      try {
        const response = await fetch(
          `/api/v1/screens/${encodeURIComponent(deviceId)}/playlist`,
          { headers: headers(token as string), cache: "no-store" },
        );
        if (!response.ok) throw new Error(String(response.status));

        const result = (await response.json()) as PlaylistResponse;
        const responseReceivedAtMs = monotonicEpochNowMs();
        if (cancelled) return;

        let nextClockOffsetMs = clockOffsetMs;
        if (result.sync) {
          const sample = clockSample({
            requestStartedAtMs,
            responseReceivedAtMs,
            serverNowMs: result.sync.serverNowMs,
          });

          clockSamplesRef.current = [...clockSamplesRef.current.slice(-8), sample];
          nextClockOffsetMs = stableServerClockOffsetMs(clockSamplesRef.current);
        }

        setClockOffsetMs(nextClockOffsetMs);
        setPlaylist(result);

        if (result.sync && result.items.length) {
          const position = expectedWallPosition({
            items: result.items,
            epochMs: result.sync.epochMs,
            localNowMs: responseReceivedAtMs,
            clockOffsetMs: nextClockOffsetMs,
          });
          setCurrentIndex(position?.index ?? 0);
        } else {
          setCurrentIndex((index) => (index < result.items.length ? index : 0));
        }

        setConnection("ONLINE");
        timeout = setTimeout(poll, Math.max(1, result.pollSeconds) * 1000);
      } catch {
        if (cancelled) return;
        setConnection("OFFLINE");
        timeout = setTimeout(poll, 5_000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [deviceId, token]);

  useEffect(() => {
    if (!token || !playlist?.preload) return;

    const preload = playlist.preload;
    if (preloadVersionRef.current === preload.manifestVersion) return;

    let cancelled = false;
    preloadVersionRef.current = preload.manifestVersion;

    async function arm() {
      let retry = 0;

      while (!cancelled) {
        try {
          await reportWallReadiness({
            deviceId,
            token: token as string,
            preload,
            status: "PRELOADING",
          });

          const uniqueAssets = Array.from(
            new Map(preload.assets.map((asset) => [asset.url, asset])).values(),
          );

          for (const asset of uniqueAssets) {
            if (cancelled) return;
            await preloadAsset(asset);
          }

          if (cancelled) return;

          await reportWallReadiness({
            deviceId,
            token: token as string,
            preload,
            status: "READY",
          });
          return;
        } catch (error) {
          if (cancelled) return;

          await reportWallReadiness({
            deviceId,
            token: token as string,
            preload,
            status: "FAILED",
            error: error instanceof Error ? error.message : "Preload failed",
          }).catch(() => null);

          retry += 1;
          await sleep(Math.min(30_000, 2_000 * 2 ** Math.min(retry, 4)));
        }
      }
    }

    void arm();
    return () => {
      cancelled = true;
      if (preloadVersionRef.current === preload.manifestVersion) {
        preloadVersionRef.current = null;
      }
    };
  }, [deviceId, playlist?.preload, token]);

  useEffect(() => {
    if (!token) return;

    async function heartbeat() {
      const response = await fetch(
        `/api/v1/screens/${encodeURIComponent(deviceId)}/heartbeat`,
        { method: "POST", headers: headers(token as string) },
      ).catch(() => null);
      if (!response?.ok) return;

      const queued = readProofQueue(deviceId);
      if (queued.length && (await sendProof(deviceId, token as string, queued))) {
        writeProofQueue(deviceId, []);
      }
    }

    void heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);
    return () => window.clearInterval(interval);
  }, [deviceId, token]);

  // A display wall follows the shared absolute clock instead of allowing each
  // browser to advance its own timeline independently.
  useEffect(() => {
    if (!playlist?.sync || !playlist.items.length) return;

    function alignToWallClock() {
      const sync = playlist?.sync;
      if (!sync) return;

      const position = expectedWallPosition({
        items: playlist.items,
        epochMs: sync.epochMs,
        localNowMs: monotonicEpochNowMs(),
        clockOffsetMs,
      });
      if (!position) return;

      setCurrentIndex((index) => (index === position.index ? index : position.index));

      const expectedItem = playlist.items[position.index];
      const video = videoRef.current;
      if (!video || expectedItem?.kind !== "ASSET" || expectedItem.type !== "VIDEO") {
        return;
      }

      if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;

      const mediaDurationSec =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : expectedItem.durationSeconds;
      const expectedSeconds =
        (position.offsetMs / 1000) % Math.max(0.001, mediaDurationSec);
      const signedDriftMs = (video.currentTime - expectedSeconds) * 1000;
      const correction = driftCorrection({
        signedDriftMs,
        toleranceMs: sync.toleranceMs,
        hardResyncMs: sync.hardResyncMs,
      });

      if (correction.mode === "HARD") {
        try {
          video.playbackRate = 1;
          video.currentTime = expectedSeconds;
        } catch {
          // Some embedded browsers reject seeks until enough metadata is loaded.
        }
      } else {
        video.playbackRate = correction.playbackRate;
      }

      if (video.paused) {
        void video.play().catch(() => null);
      }
    }

    alignToWallClock();
    const interval = window.setInterval(alignToWallClock, 200);
    return () => window.clearInterval(interval);
  }, [playlist, clockOffsetMs]);

  const currentItem = playlist?.items[currentIndex] ?? null;
  const currentKey = itemKey(currentItem, currentIndex);

  useEffect(() => {
    if (currentItem?.kind === "ASSET") {
      setLastReadyAsset(currentItem);
    }
  }, [currentKey, currentItem]);

  // Ordinary single-screen playback remains deliberately independent. Wall
  // playback never uses this local timer; the shared epoch chooses every item.
  useEffect(() => {
    if (!currentItem || !token || playlist?.sync) return;
    const startedAt = new Date();
    const durationMs = Math.max(1, currentItem.durationSeconds) * 1000;

    const timeout = window.setTimeout(async () => {
      if (currentItem.kind === "ASSET") {
        const endedAt = new Date();
        const event: ProofEvent = {
          playbackId: window.crypto.randomUUID(),
          assetId: currentItem.assetId,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationSec: Math.max(
            1,
            Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
          ),
        };
        const delivered = await sendProof(deviceId, token, [event]).catch(
          () => false,
        );
        if (!delivered) {
          writeProofQueue(deviceId, [...readProofQueue(deviceId), event]);
        }
      }

      setCurrentIndex((index) => {
        const length = playlist?.items.length ?? 0;
        return length ? (index + 1) % length : 0;
      });
    }, durationMs);

    return () => window.clearTimeout(timeout);
    // currentKey intentionally represents the playback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, deviceId, token, Boolean(playlist?.sync)]);

  // In wall mode a player may join halfway through a scene. Record the actual
  // interval this viewport rendered instead of claiming a full scheduled play.
  useEffect(() => {
    if (!playlist?.sync || currentItem?.kind !== "ASSET" || !token) return;

    const assetId = currentItem.assetId;
    const startedAtMs = Date.now();

    return () => {
      const endedAtMs = Date.now();
      const elapsedMs = endedAtMs - startedAtMs;
      if (elapsedMs < 500) return;

      const event: ProofEvent = {
        playbackId: window.crypto.randomUUID(),
        assetId,
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        durationSec: Math.max(1, Math.round(elapsedMs / 1000)),
      };

      void sendProof(deviceId, token, [event])
        .then((delivered) => {
          if (!delivered) {
            writeProofQueue(deviceId, [...readProofQueue(deviceId), event]);
          }
        })
        .catch(() => {
          writeProofQueue(deviceId, [...readProofQueue(deviceId), event]);
        });
    };
  }, [currentKey, currentItem, deviceId, playlist?.sync, token]);

  function seekLoadedWallVideo(video: HTMLVideoElement) {
    videoRef.current = video;
    const sync = playlist?.sync;
    if (!sync || currentItem?.kind !== "ASSET" || currentItem.type !== "VIDEO") {
      return;
    }

    const position = expectedWallPosition({
      items: playlist.items,
      epochMs: sync.epochMs,
      localNowMs: monotonicEpochNowMs(),
      clockOffsetMs,
    });
    if (!position || position.index !== currentIndex) return;

    const mediaDurationSec =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : currentItem.durationSeconds;
    const expectedSeconds =
      (position.offsetMs / 1000) % Math.max(0.001, mediaDurationSec);

    try {
      video.playbackRate = 1;
      video.currentTime = expectedSeconds;
    } catch {
      // The periodic wall alignment retries the seek when the player is ready.
    }
  }

  if (connection === "UNPAIRED") {
    return (
      <PlayerMessage
        eyebrow="Player not paired"
        title="This browser does not have a device token."
        body="Pair it again with the activation code from the Screens workspace."
        action={
          <Link
            href="/player"
            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 hover:no-underline"
          >
            Open pairing
          </Link>
        }
      />
    );
  }

  if (!token) {
    return (
      <PlayerMessage
        eyebrow="Connecting"
        title="Loading this player’s secure credentials."
        body="Playback will begin as soon as the device token is available."
      />
    );
  }

  const heldAsset =
    !currentItem &&
    playlist?.preload?.failurePolicy === "HOLD_LAST_READY"
      ? lastReadyAsset
      : currentItem?.kind === "SYNC_GAP" &&
          playlist?.sync?.failurePolicy === "HOLD_LAST_READY"
        ? lastReadyAsset
        : null;

  if (!playlist || (!currentItem && !heldAsset)) {
    return (
      <PlayerMessage
        eyebrow={
          connection === "OFFLINE" ? "Connection interrupted" : "Screen connected"
        }
        title={
          connection === "OFFLINE"
            ? "Running without a fresh playlist."
            : playlist?.preload
              ? "Wall campaign is pre-arming."
              : "Waiting for an active campaign."
        }
        body={
          playlist
            ? `${playlist.device.label} · ${playlist.device.name}`
            : "Contacting the G-SPAN control plane…"
        }
      />
    );
  }

  const renderItem = heldAsset ?? currentItem!;
  const renderKey =
    heldAsset && renderItem.kind === "ASSET"
      ? `held:${renderItem.assetId}:${renderItem.url}`
      : currentKey;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {renderItem.kind === "SYNC_GAP" ? (
        <div className="h-full w-full bg-black" aria-hidden="true" />
      ) : renderItem.kind === "ASSET" ? (
        renderItem.type === "VIDEO" ? (
          <video
            ref={videoRef}
            key={renderKey}
            src={renderItem.url}
            autoPlay
            muted
            playsInline
            preload="auto"
            loop={Boolean(playlist.sync)}
            onLoadedMetadata={(event) => seekLoadedWallVideo(event.currentTarget)}
            className="h-full w-full object-cover"
          />
        ) : (
          <Image
            key={renderKey}
            src={renderItem.url}
            alt=""
            fill
            unoptimized
            priority
            sizes="100vw"
            className="object-cover"
          />
        )
      ) : (
        <CollectionWidget item={renderItem} token={token} />
      )}

      <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connection === "ONLINE" ? "bg-emerald-400" : "bg-amber-400"
          }`}
        />
        {playlist.sync?.member
          ? `${playlist.sync.wallName} · ${playlist.device.label} · viewport ${playlist.sync.member.slotIndex + 1}`
          : playlist.preload
            ? `${playlist.preload.wallName} · pre-arming`
            : playlist.device.label}
      </div>
    </main>
  );
}

function PlayerMessage({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-black p-8 text-center text-white">
      <div className="max-w-xl">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
          {eyebrow}
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-zinc-400">{body}</p>
        {action ? <div className="mt-7 flex justify-center">{action}</div> : null}
      </div>
    </main>
  );
}

function CollectionWidget({ item, token }: { item: CollectionItem; token: string }) {
  const [feed, setFeed] = useState<{
    collection: { name: string };
    items: Array<{ id: string; title: string; body: string | null }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(item.feedUrl, { headers: headers(token), cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!cancelled) setFeed(result);
      });
    return () => {
      cancelled = true;
    };
  }, [item.feedUrl, token]);

  return (
    <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.22),transparent_36%),#070a08] p-[5vw]">
      <div className="w-full max-w-6xl">
        <div className="text-[1.2vw] font-semibold uppercase tracking-[0.24em] text-emerald-400">
          Live collection
        </div>
        <h1 className="mt-[1vw] text-[5vw] font-semibold leading-none tracking-tight">
          {feed?.collection.name ?? "Updating…"}
        </h1>
        <div
          className={`mt-[3vw] grid gap-[1.5vw] ${
            item.renderMode === "GRID" ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {feed?.items
            .slice(0, item.renderMode === "TICKER" ? 1 : 6)
            .map((entry) => (
              <div
                key={entry.id}
                className="rounded-[1.5vw] border border-white/10 bg-white/5 p-[2vw]"
              >
                <div className="text-[2.4vw] font-semibold">{entry.title}</div>
                {entry.body ? (
                  <div className="mt-[0.6vw] text-[1.4vw] text-zinc-300">
                    {entry.body}
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
