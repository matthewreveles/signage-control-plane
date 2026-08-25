"use client";

import { useMemo, useState } from "react";

type Orientation = "LANDSCAPE" | "PORTRAIT";
type FailurePolicy = "HOLD_LAST_READY" | "FALLBACK_STANDARD";

type ScreenOption = {
  id: string;
  screenNumber: number;
  name: string;
  deviceId: string | null;
  orientation: Orientation;
  width: number;
  height: number;
  lastSeenAt: string | Date | null;
};

type WallMember = {
  id: string;
  screenId: string;
  slotIndex: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  screen: ScreenOption;
};

type DisplayWallRow = {
  id: string;
  name: string;
  description: string | null;
  rows: number;
  columns: number;
  canvasWidth: number;
  canvasHeight: number;
  timezone: string;
  syncToleranceMs: number;
  hardResyncMs: number;
  preloadLeadSec: number;
  startGuardMs: number;
  requireAllMembersReady: boolean;
  failurePolicy: FailurePolicy;
  members: WallMember[];
  _count?: {
    creatives: number;
    campaignTargets: number;
    schedules: number;
  };
};

type EditorState = {
  name: string;
  description: string;
  rows: number;
  columns: number;
  timezone: string;
  syncToleranceMs: number;
  hardResyncMs: number;
  preloadLeadSec: number;
  startGuardMs: number;
  requireAllMembersReady: boolean;
  failurePolicy: FailurePolicy;
  slots: string[];
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function emptyEditor(screenCount: number): EditorState {
  const columns = Math.max(1, Math.min(12, screenCount || 1));
  return {
    name: "New display wall",
    description: "",
    rows: 1,
    columns,
    timezone: "America/Phoenix",
    syncToleranceMs: 80,
    hardResyncMs: 350,
    preloadLeadSec: 300,
    startGuardMs: 5000,
    requireAllMembersReady: true,
    failurePolicy: "HOLD_LAST_READY",
    slots: Array.from({ length: columns }, () => ""),
  };
}

function editorForWall(wall: DisplayWallRow): EditorState {
  const capacity = wall.rows * wall.columns;
  const slots = Array.from({ length: capacity }, () => "");

  for (const member of wall.members) {
    if (member.slotIndex >= 0 && member.slotIndex < slots.length) {
      slots[member.slotIndex] = member.screenId;
    }
  }

  return {
    name: wall.name,
    description: wall.description ?? "",
    rows: wall.rows,
    columns: wall.columns,
    timezone: wall.timezone,
    syncToleranceMs: wall.syncToleranceMs,
    hardResyncMs: wall.hardResyncMs,
    preloadLeadSec: wall.preloadLeadSec,
    startGuardMs: wall.startGuardMs,
    requireAllMembersReady: wall.requireAllMembersReady,
    failurePolicy: wall.failurePolicy,
    slots,
  };
}

export default function DisplayWallsPanel({
  initialWalls,
  screens,
}: {
  initialWalls: DisplayWallRow[];
  screens: ScreenOption[];
}) {
  const [walls, setWalls] = useState(initialWalls);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialWalls[0]?.id ?? null,
  );
  const [isNew, setIsNew] = useState(initialWalls.length === 0);
  const [editor, setEditor] = useState<EditorState>(
    initialWalls[0] ? editorForWall(initialWalls[0]) : emptyEditor(screens.length),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const screenMap = useMemo(
    () => new Map(screens.map((screen) => [screen.id, screen])),
    [screens],
  );

  const selectedWall = walls.find((wall) => wall.id === selectedId) ?? null;
  const selectedScreenIds = useMemo(
    () => new Set(editor.slots.filter(Boolean)),
    [editor.slots],
  );

  const firstSelectedScreen = editor.slots
    .map((screenId) => screenMap.get(screenId))
    .find(Boolean);

  const projectedCanvas = firstSelectedScreen
    ? {
        width: editor.columns * firstSelectedScreen.width,
        height: editor.rows * firstSelectedScreen.height,
      }
    : {
        width: isNew ? 0 : selectedWall?.canvasWidth ?? 0,
        height: isNew ? 0 : selectedWall?.canvasHeight ?? 0,
      };

  const configuredCount = editor.slots.filter(Boolean).length;
  const capacity = editor.rows * editor.columns;

  function selectWall(wall: DisplayWallRow) {
    setSelectedId(wall.id);
    setIsNew(false);
    setEditor(editorForWall(wall));
    setMessage("");
  }

  function newWall() {
    setSelectedId(null);
    setIsNew(true);
    setEditor(emptyEditor(screens.length));
    setMessage("");
  }

  function resizeGrid(rows: number, columns: number) {
    const nextRows = Math.max(1, Math.min(20, Math.trunc(rows || 1)));
    const nextColumns = Math.max(1, Math.min(100, Math.trunc(columns || 1)));
    const nextCapacity = nextRows * nextColumns;

    setEditor((current) => ({
      ...current,
      rows: nextRows,
      columns: nextColumns,
      slots: Array.from(
        { length: nextCapacity },
        (_, index) => current.slots[index] ?? "",
      ),
    }));
  }

  function setSlot(index: number, screenId: string) {
    setEditor((current) => ({
      ...current,
      slots: current.slots.map((value, slotIndex) =>
        slotIndex === index ? screenId : value,
      ),
    }));
  }

  function clearSlots() {
    setEditor((current) => ({
      ...current,
      slots: current.slots.map(() => ""),
    }));
  }

  function autofill() {
    const anchor = firstSelectedScreen ?? screens[0];
    if (!anchor) return;

    const compatible = screens.filter(
      (screen) =>
        screen.width === anchor.width &&
        screen.height === anchor.height &&
        screen.orientation === anchor.orientation,
    );

    setEditor((current) => {
      const next = [...current.slots];
      const alreadyUsed = new Set(next.filter(Boolean));
      let cursor = 0;

      for (let index = 0; index < next.length; index += 1) {
        if (next[index]) continue;

        while (cursor < compatible.length && alreadyUsed.has(compatible[cursor].id)) {
          cursor += 1;
        }

        if (cursor >= compatible.length) break;
        next[index] = compatible[cursor].id;
        alreadyUsed.add(compatible[cursor].id);
        cursor += 1;
      }

      return { ...current, slots: next };
    });
  }

  function memberPayload() {
    return editor.slots.flatMap((screenId, index) => {
      if (!screenId) return [];
      return [
        {
          screenId,
          row: Math.floor(index / editor.columns),
          column: index % editor.columns,
        },
      ];
    });
  }

  async function save() {
    if (!editor.name.trim()) return;
    if (capacity > 200) {
      setMessage("This first wall topology supports up to 200 assigned screen positions.");
      return;
    }
    if (editor.hardResyncMs <= editor.syncToleranceMs) {
      setMessage("Hard resync must be greater than normal sync tolerance.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const settings = {
        name: editor.name.trim(),
        description: editor.description.trim() || null,
        rows: editor.rows,
        columns: editor.columns,
        timezone: editor.timezone.trim() || "America/Phoenix",
        syncToleranceMs: editor.syncToleranceMs,
        hardResyncMs: editor.hardResyncMs,
        preloadLeadSec: editor.preloadLeadSec,
        startGuardMs: editor.startGuardMs,
        requireAllMembersReady: editor.requireAllMembersReady,
        failurePolicy: editor.failurePolicy,
      };

      let saved: DisplayWallRow;

      if (isNew) {
        const response = await fetch("/api/admin/display-walls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...settings, members: memberPayload() }),
        });

        if (!response.ok) throw new Error(await response.text());
        saved = await response.json();
        setWalls((current) => [saved, ...current]);
      } else {
        if (!selectedId) return;

        const settingsResponse = await fetch(
          `/api/admin/display-walls/${selectedId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
          },
        );
        if (!settingsResponse.ok) throw new Error(await settingsResponse.text());

        const membersResponse = await fetch(
          `/api/admin/display-walls/${selectedId}/members`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ members: memberPayload() }),
          },
        );
        if (!membersResponse.ok) throw new Error(await membersResponse.text());
        saved = await membersResponse.json();

        setWalls((current) =>
          current.map((wall) => (wall.id === saved.id ? saved : wall)),
        );
      }

      setSelectedId(saved.id);
      setIsNew(false);
      setEditor(editorForWall(saved));
      setMessage("Display wall saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save display wall.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWall() {
    if (!selectedId || isNew) return;
    if (!window.confirm(`Delete "${editor.name}"?`)) return;

    const response = await fetch(`/api/admin/display-walls/${selectedId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setMessage(await response.text());
      return;
    }

    const next = walls.filter((wall) => wall.id !== selectedId);
    setWalls(next);
    if (next[0]) {
      selectWall(next[0]);
    } else {
      newWall();
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Display walls</h2>
            <p className="text-xs text-zinc-500">{walls.length} configured</p>
          </div>
          <button
            type="button"
            onClick={newWall}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            + New
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {walls.map((wall) => (
            <button
              key={wall.id}
              type="button"
              onClick={() => selectWall(wall)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                wall.id === selectedId && !isNew
                  ? "border-emerald-700 bg-emerald-50"
                  : "border-zinc-200 bg-white hover:bg-zinc-50"
              }`}
            >
              <div className="font-semibold">{wall.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {wall.members.length} screens · {wall.rows}×{wall.columns} ·{" "}
                {wall.canvasWidth > 0 ? `${wall.canvasWidth}×${wall.canvasHeight}` : "canvas pending"}
              </div>
              <div className="mt-1 text-[11px] font-medium text-emerald-700">
                {wall.requireAllMembersReady ? "all-ready barrier" : "partial-ready allowed"} ·{" "}
                {Math.round(wall.preloadLeadSec / 60)} min preload
              </div>
            </button>
          ))}

          {!walls.length ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
              No display walls yet. Create one and assign screens in physical order.
            </div>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="grid flex-1 gap-4 md:grid-cols-2">
            <label className="grid gap-1 md:col-span-2">
              <span className="text-xs font-medium text-zinc-500">Wall name</span>
              <input
                value={editor.name}
                onChange={(event) =>
                  setEditor((current) => ({ ...current, name: event.target.value }))
                }
                className="h-11 rounded-xl border border-zinc-300 px-3 text-lg font-semibold outline-none focus:border-emerald-600"
              />
            </label>

            <label className="grid gap-1 md:col-span-2">
              <span className="text-xs font-medium text-zinc-500">Description</span>
              <input
                value={editor.description}
                onChange={(event) =>
                  setEditor((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Example: Mesa sales-floor ribbon"
                className="h-10 rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-500">Rows</span>
              <input
                type="number"
                min={1}
                max={20}
                value={editor.rows}
                onChange={(event) => resizeGrid(Number(event.target.value), editor.columns)}
                className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-500">Columns</span>
              <input
                type="number"
                min={1}
                max={100}
                value={editor.columns}
                onChange={(event) => resizeGrid(editor.rows, Number(event.target.value))}
                className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
              />
            </label>

            <label className="grid gap-1 md:col-span-2">
              <span className="text-xs font-medium text-zinc-500">Timezone</span>
              <input
                value={editor.timezone}
                onChange={(event) =>
                  setEditor((current) => ({ ...current, timezone: event.target.value }))
                }
                className="h-10 rounded-xl border border-zinc-300 px-3 text-sm"
              />
            </label>
          </div>

          <div className="flex shrink-0 gap-2">
            {!isNew ? (
              <button
                type="button"
                onClick={deleteWall}
                className="h-10 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={saving || !editor.name.trim()}
              className="h-10 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
            >
              {saving ? "Saving…" : "Save wall"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric label="Assigned" value={`${configuredCount}/${capacity}`} />
          <Metric
            label="Logical canvas"
            value={
              projectedCanvas.width > 0
                ? `${projectedCanvas.width.toLocaleString()}×${projectedCanvas.height.toLocaleString()}`
                : "Assign a screen"
            }
          />
          <Metric
            label="Geometry"
            value={
              firstSelectedScreen
                ? `${firstSelectedScreen.width}×${firstSelectedScreen.height} ${firstSelectedScreen.orientation.toLowerCase()}`
                : "Not established"
            }
          />
        </div>

        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Playback resilience
            </p>
            <h3 className="font-semibold text-emerald-950">Pre-arm every synchronized run</h3>
            <p className="text-sm leading-6 text-emerald-900/80">
              These controls determine how aggressively G-SPAN preloads, verifies and synchronizes the cluster before a wall campaign is allowed to take over.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-emerald-900">Sync tolerance (ms)</span>
              <input
                type="number"
                min={16}
                max={1000}
                value={editor.syncToleranceMs}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    syncToleranceMs: Math.max(16, Math.min(1000, Number(event.target.value) || 80)),
                  }))
                }
                className="h-10 rounded-xl border border-emerald-300 bg-white px-3 text-sm"
              />
              <span className="text-[11px] text-emerald-800">Drift inside this range is left untouched.</span>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-emerald-900">Hard resync (ms)</span>
              <input
                type="number"
                min={50}
                max={5000}
                value={editor.hardResyncMs}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    hardResyncMs: Math.max(50, Math.min(5000, Number(event.target.value) || 350)),
                  }))
                }
                className="h-10 rounded-xl border border-emerald-300 bg-white px-3 text-sm"
              />
              <span className="text-[11px] text-emerald-800">Moderate drift is softened; severe drift seeks.</span>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-emerald-900">Preload lead (sec)</span>
              <input
                type="number"
                min={30}
                max={86400}
                value={editor.preloadLeadSec}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    preloadLeadSec: Math.max(30, Math.min(86400, Number(event.target.value) || 300)),
                  }))
                }
                className="h-10 rounded-xl border border-emerald-300 bg-white px-3 text-sm"
              />
              <span className="text-[11px] text-emerald-800">Default: 300 sec / 5 minutes.</span>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-medium text-emerald-900">Release guard (ms)</span>
              <input
                type="number"
                min={1000}
                max={60000}
                value={editor.startGuardMs}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    startGuardMs: Math.max(1000, Math.min(60000, Number(event.target.value) || 5000)),
                  }))
                }
                className="h-10 rounded-xl border border-emerald-300 bg-white px-3 text-sm"
              />
              <span className="text-[11px] text-emerald-800">Shared future start after the final READY.</span>
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4">
              <input
                type="checkbox"
                checked={editor.requireAllMembersReady}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    requireAllMembersReady: event.target.checked,
                  }))
                }
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-emerald-950">
                  Require every member READY
                </span>
                <span className="mt-1 block text-xs leading-5 text-emerald-800">
                  Recommended. The synchronized takeover will not arm if even one required screen has not verified its exact media revision.
                </span>
              </span>
            </label>

            <label className="grid gap-1 rounded-xl border border-emerald-200 bg-white p-4">
              <span className="text-sm font-semibold text-emerald-950">Failure policy</span>
              <select
                value={editor.failurePolicy}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    failurePolicy: event.target.value as FailurePolicy,
                  }))
                }
                className="h-10 rounded-xl border border-emerald-300 bg-white px-3 text-sm"
              >
                <option value="HOLD_LAST_READY">Hold last confirmed frame/asset</option>
                <option value="FALLBACK_STANDARD">Keep lower-priority standard schedule</option>
              </select>
              <span className="text-xs leading-5 text-emerald-800">
                A blocked wall never partially starts. Choose what remains on-screen while the cluster recovers.
              </span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Physical topology</h3>
            <p className="text-sm text-zinc-500">
              Assign screens exactly as they are mounted. Position 1 is the upper-left slot.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearSlots}
              className="h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium hover:bg-zinc-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={autofill}
              className="h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Autofill compatible screens
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${editor.columns}, minmax(150px, 1fr))`,
              minWidth: `${Math.max(1, editor.columns) * 162}px`,
            }}
          >
            {editor.slots.map((screenId, index) => {
              const row = Math.floor(index / editor.columns);
              const column = index % editor.columns;
              const screen = screenMap.get(screenId);

              return (
                <label
                  key={index}
                  className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    R{row + 1} · C{column + 1}
                  </span>
                  <select
                    value={screenId}
                    onChange={(event) => setSlot(index, event.target.value)}
                    className="h-9 min-w-0 rounded-lg border border-zinc-300 bg-white px-2 text-sm"
                  >
                    <option value="">Empty</option>
                    {screens.map((option) => {
                      const usedElsewhere =
                        selectedScreenIds.has(option.id) && option.id !== screenId;
                      const incompatible =
                        firstSelectedScreen &&
                        option.id !== firstSelectedScreen.id &&
                        (option.width !== firstSelectedScreen.width ||
                          option.height !== firstSelectedScreen.height ||
                          option.orientation !== firstSelectedScreen.orientation);

                      return (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={Boolean(usedElsewhere || incompatible)}
                        >
                          {`Screen ${pad2(option.screenNumber)} · ${option.name}`}
                        </option>
                      );
                    })}
                  </select>
                  <div className="min-h-8 text-xs text-zinc-500">
                    {screen
                      ? `${screen.width}×${screen.height} · ${screen.deviceId ? "paired" : "unpaired"}`
                      : "No screen assigned"}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          The first production topology intentionally requires matching resolution and orientation across wall members. This gives synchronized playback a deterministic canvas and prevents subtle crop drift caused by mixed display geometry.
        </div>

        {message ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            {message}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}
