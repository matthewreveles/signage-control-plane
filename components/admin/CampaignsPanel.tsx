"use client";

import { useMemo, useState } from "react";

type Orientation = "LANDSCAPE" | "PORTRAIT";

type Screen = { id: string; screenNumber: number; name: string; orientation: Orientation };
type Group = { id: string; name: string };
type Playlist = { id: string; name: string };
type Asset = { id: string; name: string; type: "IMAGE" | "VIDEO" };

type Campaign = {
  id: string;
  name: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  timezone: string;
  priority: number;
  startAt: string;
  endAt: string;
  playlistId: string;
  playlist?: Playlist;
  targets: Array<any>;
};

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignsPanel({
  initialCampaigns,
  playlists,
  assets,
  screens,
  groups,
}: {
  initialCampaigns: Campaign[];
  playlists: Playlist[];
  assets: Asset[];
  screens: Screen[];
  groups: Group[];
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [creating, setCreating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Phoenix");
  const [priority, setPriority] = useState(10);

  const now = new Date();
  const [startAt, setStartAt] = useState(toLocalInputValue(now));
  const [endAt, setEndAt] = useState(toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)));

  const [mode, setMode] = useState<"PLAYLIST" | "ASSET">("PLAYLIST");
  const [playlistId, setPlaylistId] = useState<string>(playlists[0]?.id ?? "");
  const [assetId, setAssetId] = useState<string>(assets[0]?.id ?? "");

  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const canCreate = useMemo(() => {
    if (!name.trim()) return false;
    if (!startAt || !endAt) return false;
    if (mode === "PLAYLIST" && !playlistId) return false;
    if (mode === "ASSET" && !assetId) return false;
    if (screenIds.length === 0 && groupIds.length === 0) return false;
    return true;
  }, [name, startAt, endAt, mode, playlistId, assetId, screenIds, groupIds]);

  async function createCampaign() {
    if (!canCreate) return;

    setCreating(true);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          timezone,
          priority,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          playlistId: mode === "PLAYLIST" ? playlistId : undefined,
          assetId: mode === "ASSET" ? assetId : undefined,
          screenIds,
          groupIds,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();

      setCampaigns((prev) => [created, ...prev]);
      setName("");
      setScreenIds([]);
      setGroupIds([]);
    } finally {
      setCreating(false);
    }
  }

  async function publishCampaign(id: string) {
    setPublishingId(id);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());

      // Refresh list cheaply by marking local state
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "PUBLISHED" } : c))
      );
    } finally {
      setPublishingId(null);
    }
  }

  function toggle(setter: (v: string[]) => void, list: string[], id: string) {
    if (list.includes(id)) setter(list.filter((x) => x !== id));
    else setter([...list, id]);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Create campaign</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Build a time window, select content, and target screens or groups. Publish materializes schedule windows.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              placeholder="Spring Promo Week 1"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Timezone</span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              placeholder="America/Phoenix"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Start</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">End</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Priority</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
            />
          </label>

          <div className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Content type</span>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("PLAYLIST")}
                className={`h-10 flex-1 rounded-xl border px-3 text-sm font-medium ${
                  mode === "PLAYLIST"
                    ? "border-zinc-50 bg-zinc-50 text-zinc-900 dark:border-zinc-200 dark:bg-zinc-200"
                    : "border-zinc-800 bg-black text-zinc-50 dark:border-zinc-800 dark:bg-black"
                }`}
              >
                Playlist
              </button>
              <button
                onClick={() => setMode("ASSET")}
                className={`h-10 flex-1 rounded-xl border px-3 text-sm font-medium ${
                  mode === "ASSET"
                    ? "border-zinc-50 bg-zinc-50 text-zinc-900 dark:border-zinc-200 dark:bg-zinc-200"
                    : "border-zinc-800 bg-black text-zinc-50 dark:border-zinc-800 dark:bg-black"
                }`}
              >
                Single asset
              </button>
            </div>
          </div>

          {mode === "PLAYLIST" ? (
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Playlist</span>
              <select
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              >
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id.slice(0, 6)}…)
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Asset</span>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Single asset campaigns auto-create a one-item playlist behind the scenes.
              </span>
            </label>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm font-semibold">Target screens</div>
            <div className="mt-2 grid gap-2">
              {screens.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={screenIds.includes(s.id)}
                    onChange={() => toggle(setScreenIds, screenIds, s.id)}
                  />
                  <span>
                    Screen {String(s.screenNumber).padStart(2, "0")} — {s.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm font-semibold">Target groups</div>
            <div className="mt-2 grid gap-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={groupIds.includes(g.id)}
                    onChange={() => toggle(setGroupIds, groupIds, g.id)}
                  />
                  <span>{g.name}</span>
                </label>
              ))}
              {groups.length === 0 ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  No groups yet. Create one via API first, then target it here.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={createCampaign}
            disabled={!canCreate || creating}
            className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {creating ? "Creating…" : "Create campaign"}
          </button>
        </div>

        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <h3 className="text-base font-semibold tracking-tight">Campaign list</h3>
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="grid grid-cols-12 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 dark:bg-black dark:text-zinc-400">
              <div className="col-span-4">Campaign</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-4">Window</div>
              <div className="col-span-2">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {campaigns.map((c) => (
                <li key={c.id} className="grid grid-cols-12 px-4 py-3">
                  <div className="col-span-4">
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {c.playlist?.name ?? c.playlistId} · Priority {c.priority} · TZ {c.timezone}
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center text-sm">
                    {c.status}
                  </div>
                  <div className="col-span-4 flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                    {new Date(c.startAt).toLocaleString()} → {new Date(c.endAt).toLocaleString()}
                  </div>
                  <div className="col-span-2 flex items-center justify-end">
                    <button
                      onClick={() => publishCampaign(c.id)}
                      disabled={publishingId === c.id}
                      className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
                    >
                      {publishingId === c.id ? "Publishing…" : "Publish"}
                    </button>
                  </div>
                </li>
              ))}
              {campaigns.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  No campaigns yet.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}