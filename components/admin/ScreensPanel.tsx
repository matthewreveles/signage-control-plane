"use client";

import { useMemo, useState } from "react";

type Orientation = "LANDSCAPE" | "PORTRAIT";

type ScreenRow = {
  id: string;
  screenNumber: number;
  name: string;
  deviceId: string | null;
  activationCode: string;
  orientation: Orientation;
  width: number;
  height: number;
  timezone: string;
  lastSeenAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type Props = {
  initialScreens: ScreenRow[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

export default function ScreensPanel({ initialScreens }: Props) {
  const [screens, setScreens] = useState<ScreenRow[]>(initialScreens);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return screens;
    return screens.filter((s) => {
      const label = `screen ${pad2(s.screenNumber)}`.toLowerCase();
      return (
        label.includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.deviceId ?? "").toLowerCase().includes(q) ||
        s.activationCode.toLowerCase().includes(q)
      );
    });
  }, [screens, filter]);

  async function createScreen() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/screens/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create screen");
      }

      const created = (await res.json()) as ScreenRow;

      setScreens((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => a.screenNumber - b.screenNumber);
        return next;
      });
    } finally {
      setCreating(false);
    }
  }

  async function renameScreen(id: string, name: string) {
    const res = await fetch(`/api/admin/screens/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to rename screen");
    }

    const updated = (await res.json()) as ScreenRow;
    setScreens((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight">Screens</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Default labels are numbered. Rename anytime.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search screens..."
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-300 dark:border-zinc-800 dark:bg-black dark:placeholder:text-zinc-600 dark:focus:border-zinc-700 sm:w-64"
          />

          <button
            onClick={createScreen}
            disabled={creating}
            className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
          >
            {creating ? "Creating..." : "Create screen"}
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="grid grid-cols-12 gap-0 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 dark:bg-black dark:text-zinc-400">
          <div className="col-span-4">Screen</div>
          <div className="col-span-2">Orientation</div>
          <div className="col-span-2">Resolution</div>
          <div className="col-span-2">Last seen</div>
          <div className="col-span-2">Activation</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No screens found.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filtered.map((s) => (
              <ScreenRow
                key={s.id}
                screen={s}
                onRename={renameScreen}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ScreenRow({
  screen,
  onRename,
}: {
  screen: ScreenRow;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(screen.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = `Screen ${pad2(screen.screenNumber)}`;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);
    try {
      await onRename(screen.id, trimmed);
    } catch (e: any) {
      setError(e?.message ?? "Rename failed");
      setName(screen.name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="grid grid-cols-12 gap-0 px-4 py-3">
      <div className="col-span-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {label}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-700"
              aria-label={`Rename ${label}`}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {saving ? "Saving..." : " "}
            </span>
          </div>

          {error ? (
            <div className="text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          ) : null}

          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Device: {screen.deviceId ?? "unpaired"} · TZ: {screen.timezone}
          </div>
        </div>
      </div>

      <div className="col-span-2 flex items-center text-sm text-zinc-700 dark:text-zinc-300">
        {screen.orientation}
      </div>

      <div className="col-span-2 flex items-center text-sm text-zinc-700 dark:text-zinc-300">
        {screen.width}×{screen.height}
      </div>

      <div className="col-span-2 flex items-center text-sm text-zinc-700 dark:text-zinc-300">
        {fmtDate(screen.lastSeenAt)}
      </div>

      <div className="col-span-2 flex items-center justify-between gap-2">
        <code className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {screen.activationCode}
        </code>
      </div>
    </li>
  );
}