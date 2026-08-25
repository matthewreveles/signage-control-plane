"use client";

import { useMemo, useState } from "react";

type Orientation = "LANDSCAPE" | "PORTRAIT";

type Screen = {
  id: string;
  screenNumber: number;
  name: string;
  orientation: Orientation;
};
type Group = { id: string; name: string };
type Wall = {
  id: string;
  name: string;
  rows: number;
  columns: number;
  canvasWidth: number;
  canvasHeight: number;
  members: Array<{ screenId: string }>;
};
type Playlist = { id: string; name: string };
type Asset = { id: string; name: string; type: "IMAGE" | "VIDEO" };
type CreativePackage = {
  id: string;
  name: string;
  brand: string;
  variants: Array<{ destination: "SIGNAGE" | "REVIVE" }>;
};
type WallCreative = {
  id: string;
  wallId: string;
  name: string;
  type: "IMAGE" | "VIDEO";
  durationSec: number | null;
  masterWidth: number;
  masterHeight: number;
  wall: Wall;
};

type Campaign = {
  id: string;
  name: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  timezone: string;
  priority: number;
  startAt: string;
  endAt: string;
  scheduleType: "ONE_TIME" | "RECURRING";
  recurrenceDays: number[];
  recurrenceStartDate: string | null;
  recurrenceEndDate: string | null;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  playlistId: string;
  playlist?: Playlist;
  targets: Array<{
    id: string;
    type: "SCREEN" | "GROUP" | "WALL";
    screenId: string | null;
    groupId: string | null;
    wallId: string | null;
  }>;
};

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS = [
  { value: 0, short: "Sun", long: "Sunday" },
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
] as const;

type ContentMode = "PLAYLIST" | "PACKAGE" | "ASSET" | "WALL";

export default function CampaignsPanel({
  initialCampaigns,
  playlists,
  assets,
  creativePackages,
  screens,
  groups,
  walls,
  wallCreatives,
}: {
  initialCampaigns: Campaign[];
  playlists: Playlist[];
  assets: Asset[];
  creativePackages: CreativePackage[];
  screens: Screen[];
  groups: Group[];
  walls: Wall[];
  wallCreatives: WallCreative[];
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [creating, setCreating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Phoenix");
  const [priority, setPriority] = useState(10);

  const now = new Date();
  const recurringEndDefault = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  );

  const [scheduleType, setScheduleType] =
    useState<"ONE_TIME" | "RECURRING">("ONE_TIME");
  const [startAt, setStartAt] = useState(toLocalInputValue(now));
  const [endAt, setEndAt] = useState(
    toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)),
  );
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceStartDate, setRecurrenceStartDate] = useState(
    toDateInputValue(now),
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    toDateInputValue(recurringEndDefault),
  );
  const [dailyStartTime, setDailyStartTime] = useState("08:00");
  const [dailyEndTime, setDailyEndTime] = useState("23:00");

  const defaultMode: ContentMode = creativePackages.length
    ? "PACKAGE"
    : playlists.length
      ? "PLAYLIST"
      : wallCreatives.length
        ? "WALL"
        : "ASSET";

  const [mode, setMode] = useState<ContentMode>(defaultMode);
  const [playlistId, setPlaylistId] = useState<string>(playlists[0]?.id ?? "");
  const [assetId, setAssetId] = useState<string>(assets[0]?.id ?? "");
  const [creativePackageId, setCreativePackageId] = useState<string>(
    creativePackages[0]?.id ?? "",
  );
  const [displayWallCreativeId, setDisplayWallCreativeId] = useState<string>(
    wallCreatives[0]?.id ?? "",
  );

  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [wallIds, setWallIds] = useState<string[]>([]);

  const selectedWallCreative = wallCreatives.find(
    (creative) => creative.id === displayWallCreativeId,
  );

  const canCreate = useMemo(() => {
    if (!name.trim()) return false;

    if (scheduleType === "ONE_TIME") {
      if (!startAt || !endAt) return false;
    } else {
      if (!recurrenceStartDate || !recurrenceEndDate) return false;
      if (recurrenceEndDate < recurrenceStartDate) return false;
      if (!dailyStartTime || !dailyEndTime) return false;
      if (recurrenceDays.length === 0) return false;
    }

    if (mode === "PLAYLIST" && !playlistId) return false;
    if (mode === "PACKAGE" && !creativePackageId) return false;
    if (mode === "ASSET" && !assetId) return false;
    if (mode === "WALL" && !displayWallCreativeId) return false;

    if (
      screenIds.length === 0 &&
      groupIds.length === 0 &&
      wallIds.length === 0 &&
      mode !== "WALL"
    ) {
      return false;
    }

    return true;
  }, [
    name,
    scheduleType,
    startAt,
    endAt,
    recurrenceStartDate,
    recurrenceEndDate,
    dailyStartTime,
    dailyEndTime,
    recurrenceDays,
    mode,
    playlistId,
    creativePackageId,
    assetId,
    displayWallCreativeId,
    screenIds,
    groupIds,
    wallIds,
  ]);

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
          scheduleType,
          ...(scheduleType === "ONE_TIME"
            ? {
                startAt: new Date(startAt).toISOString(),
                endAt: new Date(endAt).toISOString(),
              }
            : {
                recurrenceDays,
                recurrenceStartDate,
                recurrenceEndDate,
                dailyStartTime,
                dailyEndTime,
              }),
          playlistId: mode === "PLAYLIST" ? playlistId : undefined,
          creativePackageId: mode === "PACKAGE" ? creativePackageId : undefined,
          assetId: mode === "ASSET" ? assetId : undefined,
          displayWallCreativeId:
            mode === "WALL" ? displayWallCreativeId : undefined,
          screenIds,
          groupIds,
          wallIds,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as Campaign;

      setCampaigns((prev) => [created, ...prev]);
      setName("");
      setScreenIds([]);
      setGroupIds([]);
      setWallIds([]);
    } finally {
      setCreating(false);
    }
  }

  async function publishCampaign(id: string) {
    setPublishingId(id);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/publish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());

      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.id === id ? { ...campaign, status: "PUBLISHED" } : campaign,
        ),
      );
    } finally {
      setPublishingId(null);
    }
  }

  function toggle(setter: (value: string[]) => void, list: string[], id: string) {
    if (list.includes(id)) setter(list.filter((value) => value !== id));
    else setter([...list, id]);
  }

  function toggleRecurrenceDay(day: number) {
    setRecurrenceDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  function chooseWallCreative(id: string) {
    setDisplayWallCreativeId(id);
    const creative = wallCreatives.find((candidate) => candidate.id === id);
    if (creative) {
      setWallIds((current) =>
        current.includes(creative.wallId)
          ? current
          : [...current, creative.wallId],
      );
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Create campaign</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Build a time window, select content, and target individual screens,
            groups or synchronized display walls. Publish materializes the
            device schedule.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              placeholder="GP Mart wall takeover"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Timezone</span>
            <input
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              placeholder="America/Phoenix"
            />
          </label>

          <div className="grid gap-2 sm:col-span-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Schedule type
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScheduleType("ONE_TIME")}
                className={`h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                  scheduleType === "ONE_TIME"
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
                }`}
              >
                One time
              </button>
              <button
                type="button"
                onClick={() => setScheduleType("RECURRING")}
                className={`h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                  scheduleType === "RECURRING"
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
                }`}
              >
                Recurring
              </button>
            </div>
          </div>

          {scheduleType === "ONE_TIME" ? (
            <>
              <label className="grid gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Start</span>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">End</span>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                />
              </label>
            </>
          ) : (
            <div className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs text-zinc-500">Campaign start date</span>
                  <input
                    type="date"
                    value={recurrenceStartDate}
                    onChange={(event) => setRecurrenceStartDate(event.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-zinc-500">Campaign end date</span>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(event) => setRecurrenceEndDate(event.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none"
                  />
                </label>
              </div>

              <div className="grid gap-2">
                <span className="text-xs text-zinc-500">Repeat on</span>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day) => {
                    const selected = recurrenceDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleRecurrenceDay(day.value)}
                        title={day.long}
                        className={`h-10 rounded-lg border text-xs font-semibold transition-colors ${
                          selected
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs text-zinc-500">Daily start</span>
                  <input
                    type="time"
                    value={dailyStartTime}
                    onChange={(event) => setDailyStartTime(event.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-zinc-500">Daily end</span>
                  <input
                    type="time"
                    value={dailyEndTime}
                    onChange={(event) => setDailyEndTime(event.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none"
                  />
                </label>
              </div>

              <p className="text-xs text-zinc-500">
                Times use the campaign timezone. An end time earlier than the
                start time creates an overnight window.
              </p>
            </div>
          )}

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Priority</span>
            <input
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
            />
          </label>

          <div className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Content type</span>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {(
                [
                  ["PLAYLIST", "Playlist"],
                  ["PACKAGE", "Factory package"],
                  ["ASSET", "Single asset"],
                  ["WALL", "Shared wall"],
                ] as Array<[ContentMode, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    mode === value
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                      : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "PLAYLIST" ? (
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Playlist</span>
              <select
                value={playlistId}
                onChange={(event) => setPlaylistId(event.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              >
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name} ({playlist.id.slice(0, 6)}…)
                  </option>
                ))}
              </select>
            </label>
          ) : mode === "PACKAGE" ? (
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Approved creative package
              </span>
              <select
                value={creativePackageId}
                onChange={(event) => setCreativePackageId(event.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              >
                {creativePackages.map((creativePackage) => {
                  const signageCount = creativePackage.variants.filter(
                    (variant) => variant.destination === "SIGNAGE",
                  ).length;
                  return (
                    <option key={creativePackage.id} value={creativePackage.id}>
                      {creativePackage.brand} — {creativePackage.name} ({signageCount} screen variants)
                    </option>
                  );
                })}
              </select>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                The player selects the best landscape or portrait variant for each screen.
              </span>
            </label>
          ) : mode === "WALL" ? (
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                READY shared wall creative
              </span>
              <select
                value={displayWallCreativeId}
                onChange={(event) => chooseWallCreative(event.target.value)}
                className="h-10 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-sm outline-none"
              >
                {wallCreatives.map((creative) => (
                  <option key={creative.id} value={creative.id}>
                    {creative.wall.name} — {creative.name} · {creative.masterWidth}×{creative.masterHeight}
                  </option>
                ))}
              </select>
              <span className="text-xs text-emerald-800">
                The owning wall is automatically included as a campaign target.
                {selectedWallCreative
                  ? ` ${selectedWallCreative.wall.members.length} screen(s) will receive position-specific tiles.`
                  : ""}
              </span>
            </label>
          ) : (
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Asset</span>
              <select
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              >
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} ({asset.type})
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Single asset campaigns auto-create a one-item playlist behind the scenes.
              </span>
            </label>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <TargetCard title="Target screens">
            {screens.map((screen) => (
              <label key={screen.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={screenIds.includes(screen.id)}
                  onChange={() => toggle(setScreenIds, screenIds, screen.id)}
                />
                <span>
                  Screen {String(screen.screenNumber).padStart(2, "0")} — {screen.name}
                </span>
              </label>
            ))}
          </TargetCard>

          <TargetCard title="Target groups">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={groupIds.includes(group.id)}
                  onChange={() => toggle(setGroupIds, groupIds, group.id)}
                />
                <span>{group.name}</span>
              </label>
            ))}
            {!groups.length ? (
              <div className="text-sm text-zinc-500">No ordinary screen groups configured.</div>
            ) : null}
          </TargetCard>

          <TargetCard title="Target display walls" accent>
            {walls.map((wall) => (
              <label key={wall.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={wallIds.includes(wall.id)}
                  onChange={() => toggle(setWallIds, wallIds, wall.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{wall.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {wall.members.length} screens · {wall.rows}×{wall.columns} ·{" "}
                    {wall.canvasWidth.toLocaleString()}×{wall.canvasHeight.toLocaleString()}
                  </span>
                </span>
              </label>
            ))}
            {!walls.length ? (
              <div className="text-sm text-zinc-500">
                No display walls configured yet. Build one in Display walls first.
              </div>
            ) : null}
          </TargetCard>
        </div>

        <div className="flex justify-end">
          <button
            onClick={createCampaign}
            disabled={!canCreate || creating}
            className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:opacity-100"
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
              {campaigns.map((campaign) => {
                const wallTargetCount = campaign.targets.filter(
                  (target) => target.type === "WALL",
                ).length;
                return (
                  <li key={campaign.id} className="grid grid-cols-12 px-4 py-3">
                    <div className="col-span-4">
                      <div className="text-sm font-semibold">{campaign.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {campaign.playlist?.name ?? campaign.playlistId} · Priority {campaign.priority}
                        {wallTargetCount ? ` · ${wallTargetCount} wall target(s)` : ""}
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center text-sm">
                      {campaign.status}
                    </div>
                    <div className="col-span-4 flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                      {campaign.scheduleType === "RECURRING" ? (
                        <div className="grid gap-0.5">
                          <span>
                            {WEEKDAYS.filter((day) =>
                              campaign.recurrenceDays.includes(day.value),
                            )
                              .map((day) => day.short)
                              .join(", ")}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {campaign.recurrenceStartDate} → {campaign.recurrenceEndDate}
                            {" · "}
                            {campaign.dailyStartTime} → {campaign.dailyEndTime}
                          </span>
                        </div>
                      ) : (
                        <>
                          {new Date(campaign.startAt).toLocaleString()} →{" "}
                          {new Date(campaign.endAt).toLocaleString()}
                        </>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      {campaign.status === "DRAFT" ? (
                        <button
                          type="button"
                          onClick={() => publishCampaign(campaign.id)}
                          disabled={publishingId === campaign.id}
                          className="h-9 rounded-xl border border-emerald-700 bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-zinc-200 disabled:text-zinc-500"
                        >
                          {publishingId === campaign.id ? "Publishing…" : "Publish"}
                        </button>
                      ) : (
                        <span className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">
                          {campaign.status === "PUBLISHED" ? "Published" : "Archived"}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              {!campaigns.length ? (
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

function TargetCard({
  title,
  accent = false,
  children,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 grid gap-2">{children}</div>
    </div>
  );
}
