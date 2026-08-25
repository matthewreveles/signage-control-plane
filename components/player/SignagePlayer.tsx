"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  estimateServerClockOffsetMs,
  expectedWallPosition,
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

export default function SignagePlayer({ deviceId }: { deviceId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [connection, setConnection] = useState<
    "CONNECTING" | "ONLINE" | "OFFLINE" | "UNPAIRED"
  >("CONNECTING");
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
      const requestStartedAtMs = Date.now();

      try {
        const response = await fetch(
          `/api/v1/screens/${encodeURIComponent(deviceId)}/playlist`,
          { headers: headers(token as string), cache: "no-store" },
        );
        if (!response.ok) throw new Error(String(response.status));

        const result = (await response.json()) as PlaylistResponse;
        const responseReceivedAtMs = Date.now();
        if (cancelled) return;

        let nextClockOffsetMs = 0;
        if (result.sync) {
          nextClockOffsetMs = estimateServerClockOffsetMs({
            requestStartedAtMs,
            responseReceivedAtMs,
            serverNowMs: result.sync.serverNowMs,
          });
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
        timeout = setTimeout(poll, Math.max(15, result.pollSeconds) * 1000);
      } catch {
        if (cancelled) return;
        setConnection("OFFLINE");
        timeout = setTimeout(poll, 15_000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [deviceId, token]);

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
        localNowMs: Date.now(),
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
      const driftMs = Math.abs(video.currentTime - expectedSeconds) * 1000;

      if (driftMs > sync.toleranceMs) {
        try {
          video.currentTime = expectedSeconds;
        } catch {
          // Some embedded browsers reject seeks until enough metadata is loaded.
        }
      }

      if (video.paused) {
        void video.play().catch(() => null);
      }
    }

    alignToWallClock();
    const interval = window.setInterval(alignToWallClock, 250);
    return () => window.clearInterval(interval);
  }, [playlist, clockOffsetMs]);

  const currentItem = playlist?.items[currentIndex] ?? null;
  const currentKey = itemKey(currentItem, currentIndex);

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
      localNowMs: Date.now(),
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

  if (!playlist || !currentItem) {
    return (
      <PlayerMessage
        eyebrow={
          connection === "OFFLINE" ? "Connection interrupted" : "Screen connected"
        }
        title={
          connection === "OFFLINE"
            ? "Running without a fresh playlist."
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

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {currentItem.kind === "SYNC_GAP" ? (
        <div className="h-full w-full bg-black" aria-hidden="true" />
      ) : currentItem.kind === "ASSET" ? (
        currentItem.type === "VIDEO" ? (
          <video
            ref={videoRef}
            key={currentKey}
            src={currentItem.url}
            autoPlay
            muted
            playsInline
            loop={Boolean(playlist.sync)}
            onLoadedMetadata={(event) => seekLoadedWallVideo(event.currentTarget)}
            className="h-full w-full object-cover"
          />
        ) : (
          <Image
            key={currentKey}
            src={currentItem.url}
            alt=""
            fill
            unoptimized
            priority
            sizes="100vw"
            className="object-cover"
          />
        )
      ) : (
        <CollectionWidget item={currentItem} token={token} />
      )}

      <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connection === "ONLINE" ? "bg-emerald-400" : "bg-amber-400"
          }`}
        />
        {playlist.sync?.member
          ? `${playlist.sync.wallName} · ${playlist.device.label} · viewport ${playlist.sync.member.slotIndex + 1}`
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
