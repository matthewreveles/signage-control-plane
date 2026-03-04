"use client";

import { useEffect, useMemo, useState } from "react";

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

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function ratioString(w: number, h: number) {
  if (!w || !h) return "—";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.abs(w), Math.abs(h));
  const rw = Math.round(w / g);
  const rh = Math.round(h / g);
  return `${rw}:${rh}`;
}

const PRESETS: Array<{
  label: string;
  width: number;
  height: number;
  orientation: Orientation;
}> = [
  { label: "1080p Landscape", width: 1920, height: 1080, orientation: "LANDSCAPE" },
  { label: "4K Landscape", width: 3840, height: 2160, orientation: "LANDSCAPE" },
  { label: "1080p Portrait", width: 1080, height: 1920, orientation: "PORTRAIT" },
  { label: "4K Portrait", width: 2160, height: 3840, orientation: "PORTRAIT" },
];

export default function ScreensPanel({ initialScreens }: Props) {
  const [screens, setScreens] = useState<ScreenRow[]>(initialScreens);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const editing = useMemo(
    () => screens.find((s) => s.id === editId) ?? null,
    [screens, editId]
  );

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

  async function patchScreen(
    id: string,
    patch: Partial<Pick<ScreenRow, "name" | "orientation" | "width" | "height" | "timezone">>
  ) {
    const res = await fetch(`/api/admin/screens/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to update screen");
    }

    const updated = (await res.json()) as ScreenRow;
    setScreens((prev) => prev.map((s) => (s.id === id ? updated : s)));
    return updated;
  }

  async function renameScreen(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await patchScreen(id, { name: trimmed });
  }

  function openEdit(id: string) {
    setEditId(id);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditId(null);
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
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 dark:border-zinc-800 dark:bg-black dark:placeholder:text-zinc-600 dark:focus:border-zinc-700 sm:w-64"
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
        <div className="grid grid-cols-12 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 dark:bg-black dark:text-zinc-400">
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
              <ScreenRowItem
                key={s.id}
                screen={s}
                onRename={renameScreen}
                onEdit={() => openEdit(s.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {editOpen && editing ? (
        <EditScreenModal
          screen={editing}
          onClose={closeEdit}
          onSave={async (patch) => {
            await patchScreen(editing.id, patch);
            closeEdit();
          }}
        />
      ) : null}
    </section>
  );
}

function ScreenRowItem({
  screen,
  onRename,
  onEdit,
}: {
  screen: ScreenRow;
  onRename: (id: string, name: string) => Promise<void>;
  onEdit: () => void;
}) {
  const [name, setName] = useState(screen.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = `Screen ${pad2(screen.screenNumber)}`;

  async function saveName() {
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
    <li className="grid grid-cols-12 px-4 py-3">
      <div className="col-span-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {label}
            </div>
            <button
              onClick={onEdit}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Edit
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-300 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-700"
              aria-label={`Rename ${label}`}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {saving ? "Saving..." : " "}
            </span>
          </div>

          {error ? (
            <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
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

function EditScreenModal({
  screen,
  onClose,
  onSave,
}: {
  screen: ScreenRow;
  onClose: () => void;
  onSave: (
    patch: Partial<Pick<ScreenRow, "orientation" | "width" | "height" | "timezone">>
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<"PRESETS" | "CUSTOM">("PRESETS");

  const [orientation, setOrientation] = useState<Orientation>(screen.orientation);
  const [width, setWidth] = useState<number>(screen.width);
  const [height, setHeight] = useState<number>(screen.height);
  const [timezone, setTimezone] = useState<string>(screen.timezone);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = `Screen ${pad2(screen.screenNumber)}`;

  // Close on ESC.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Smart auto-swap when orientation changes.
  useEffect(() => {
    if (orientation === "PORTRAIT" && width > height) {
      const w = width;
      const h = height;
      setWidth(h);
      setHeight(w);
    }
    if (orientation === "LANDSCAPE" && height > width) {
      const w = width;
      const h = height;
      setWidth(h);
      setHeight(w);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setMode("PRESETS");
    setOrientation(p.orientation);
    setWidth(p.width);
    setHeight(p.height);
  }

  function swap() {
    const w = width;
    const h = height;
    setWidth(h);
    setHeight(w);
    setMode("CUSTOM");
  }

  function validate(): string | null {
    if (!Number.isInteger(width) || width < 320 || width > 7680) {
      return "Width must be an integer between 320 and 7680.";
    }
    if (!Number.isInteger(height) || height < 320 || height > 7680) {
      return "Height must be an integer between 320 and 7680.";
    }
    if (!timezone.trim()) return "Timezone is required.";
    return null;
  }

  async function save() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        orientation,
        width: clampInt(width, 320, 7680),
        height: clampInt(height, 320, 7680),
        timezone: timezone.trim(),
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Edit {label}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Change orientation, resolution, and timezone.
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          {/* Orientation */}
          <div className="grid gap-2">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Orientation
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setOrientation("LANDSCAPE")}
                className={[
                  "h-10 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors",
                  orientation === "LANDSCAPE"
                    ? "border-zinc-50 bg-zinc-50 text-zinc-900 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                    : "border-zinc-800 bg-black text-zinc-50 hover:bg-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                Landscape
              </button>

              <button
                onClick={() => setOrientation("PORTRAIT")}
                className={[
                  "h-10 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors",
                  orientation === "PORTRAIT"
                    ? "border-zinc-50 bg-zinc-50 text-zinc-900 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                    : "border-zinc-800 bg-black text-zinc-50 hover:bg-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                Portrait
              </button>
            </div>
          </div>

          {/* Mode */}
          <div className="grid gap-2">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Dimensions mode
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("PRESETS")}
                className={[
                  "h-10 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors",
                  mode === "PRESETS"
                    ? "border-zinc-50 bg-zinc-50 text-zinc-900 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                    : "border-zinc-800 bg-black text-zinc-50 hover:bg-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                Presets
              </button>

              <button
                onClick={() => setMode("CUSTOM")}
                className={[
                  "h-10 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors",
                  mode === "CUSTOM"
                    ? "border-zinc-50 bg-zinc-50 text-zinc-900 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                    : "border-zinc-800 bg-black text-zinc-50 hover:bg-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900",
                ].join(" ")}
              >
                Custom
              </button>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Use presets for standard screens. Use custom for oddball installs, split displays, or nonstandard ratios.
            </div>
          </div>

          {/* Presets */}
          {mode === "PRESETS" ? (
            <div className="grid gap-2">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Presets
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Resolution */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Resolution
              </div>
              <button
                onClick={swap}
                className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                Swap
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Width</span>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => {
                    setWidth(Number(e.target.value));
                    setMode("CUSTOM");
                  }}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-300 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-700"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Height</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => {
                    setHeight(Number(e.target.value));
                    setMode("CUSTOM");
                  }}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-300 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-700"
                />
              </label>
            </div>

            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Current: {width}×{height} · {orientation} · Ratio {ratioString(width, height)}
            </div>
          </div>

          {/* Timezone */}
          <div className="grid gap-2">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Timezone
            </div>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Phoenix"
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-300 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:focus:border-zinc-700"
            />
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Example: America/Phoenix
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}