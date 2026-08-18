"use client";

import { useMemo, useState } from "react";

type Asset = {
  id: string;
  name: string;
  type: "IMAGE" | "VIDEO";
  orientation: "LANDSCAPE" | "PORTRAIT";
  masterUrl: string;
};

type StoredItem = {
  id: string;
  kind: string;
  assetId: string | null;
  durationSec: number | null;
  asset: Asset | null;
};

type Playlist = {
  id: string;
  name: string;
  items: StoredItem[];
};

type EditorItem = {
  key: string;
  assetId: string;
  durationSec: number;
};

function editorItemsFor(playlist: Playlist): EditorItem[] {
  return playlist.items
    .filter((item) => item.kind === "ASSET" && item.assetId)
    .map((item) => ({
      key: item.id,
      assetId: item.assetId!,
      durationSec: item.durationSec ?? 10,
    }));
}

export default function PlaylistsPanel({
  initialPlaylists,
  assets,
}: {
  initialPlaylists: Playlist[];
  assets: Asset[];
}) {
  const [playlists, setPlaylists] = useState(initialPlaylists);

  const first = initialPlaylists[0] ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(
    first?.id ?? null,
  );

  const [name, setName] = useState(first?.name ?? "");
  const [items, setItems] = useState<EditorItem[]>(
    first ? editorItemsFor(first) : [],
  );

  const [isNew, setIsNew] = useState(!first);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [assetToAdd, setAssetToAdd] = useState(assets[0]?.id ?? "");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const selectedPlaylist = playlists.find((p) => p.id === selectedId) ?? null;

  const selectedEditable =
    isNew ||
    !selectedPlaylist ||
    selectedPlaylist.items.every((item) => item.kind === "ASSET");

  const totalSeconds = useMemo(
    () => items.reduce((sum, item) => sum + item.durationSec, 0),
    [items],
  );

  const assetMap = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  function selectPlaylist(playlist: Playlist) {
    setSelectedId(playlist.id);
    setName(playlist.name);
    setItems(editorItemsFor(playlist));
    setIsNew(false);
    setMessage("");
  }

  function newPlaylist() {
    setSelectedId(null);
    setName("New playlist");
    setItems([]);
    setIsNew(true);
    setMessage("");
  }

  function addAsset() {
    if (!assetToAdd) return;

    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        assetId: assetToAdd,
        durationSec: 10,
      },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function setDuration(index: number, durationSec: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              durationSec: Math.max(1, Math.min(3600, durationSec || 1)),
            }
          : item,
      ),
    );
  }

  function moveItem(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;

    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function savePlaylist() {
    if (!name.trim() || !selectedEditable) return;

    setSaving(true);
    setMessage("");

    try {
      const url = isNew
        ? "/api/admin/playlists"
        : `/api/admin/playlists/${selectedId}`;

      const response = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          items: items.map((item) => ({
            assetId: item.assetId,
            durationSec: item.durationSec,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const saved: Playlist = await response.json();

      setPlaylists((prev) =>
        isNew
          ? [saved, ...prev]
          : prev.map((playlist) =>
              playlist.id === saved.id ? saved : playlist,
            ),
      );

      setSelectedId(saved.id);
      setName(saved.name);
      setItems(editorItemsFor(saved));
      setIsNew(false);
      setMessage("Playlist saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save playlist.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deletePlaylist() {
    if (isNew || !selectedId) return;

    if (!window.confirm(`Delete "${name}"?`)) return;

    setMessage("");

    const response = await fetch(`/api/admin/playlists/${selectedId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setMessage(await response.text());
      return;
    }

    const next = playlists.filter((playlist) => playlist.id !== selectedId);
    setPlaylists(next);

    if (next[0]) {
      selectPlaylist(next[0]);
    } else {
      newPlaylist();
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Playlists</h2>
            <p className="text-xs text-zinc-500">
              {playlists.length} saved
            </p>
          </div>

          <button
            type="button"
            onClick={newPlaylist}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            + New
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {playlists.map((playlist) => {
            const assetOnly = playlist.items.every(
              (item) => item.kind === "ASSET",
            );

            return (
              <button
                key={playlist.id}
                type="button"
                onClick={() => selectPlaylist(playlist)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  playlist.id === selectedId && !isNew
                    ? "border-emerald-700 bg-emerald-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                <div className="font-semibold">{playlist.name}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {playlist.items.length} item(s)
                  {!assetOnly ? " · mixed content" : ""}
                </div>
              </button>
            );
          })}

          {!playlists.length ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
              No playlists yet.
            </div>
          ) : null}
        </div>
      </aside>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-500">
                Playlist name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!selectedEditable}
                className="h-11 rounded-xl border border-zinc-300 px-3 text-lg font-semibold outline-none focus:border-emerald-600"
              />
            </label>

            <div className="mt-2 text-sm text-zinc-500">
              {items.length} item(s) · {totalSeconds} sec ·{" "}
              {(totalSeconds / 60).toFixed(1)} min per rotation
            </div>
          </div>

          <div className="flex gap-2">
            {!isNew ? (
              <button
                type="button"
                onClick={deletePlaylist}
                className="h-10 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            ) : null}

            <button
              type="button"
              onClick={savePlaylist}
              disabled={saving || !name.trim() || !selectedEditable}
              className="h-10 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
            >
              {saving ? "Saving…" : "Save playlist"}
            </button>
          </div>
        </div>

        {!selectedEditable ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This playlist contains package or structured-content items. The
            first Playlist Builder only edits asset-only playlists so we do not
            accidentally destroy those richer entries.
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="grid flex-1 gap-1">
                  <span className="text-xs font-medium text-zinc-500">
                    Add asset
                  </span>

                  <select
                    value={assetToAdd}
                    onChange={(event) => setAssetToAdd(event.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                  >
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} · {asset.orientation}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={addAsset}
                  disabled={!assetToAdd}
                  className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
                >
                  Add to playlist
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {items.map((item, index) => {
                const asset = assetMap.get(item.assetId);

                return (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) {
                        moveItem(dragIndex, index);
                      }
                      setDragIndex(null);
                    }}
                    className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-[40px_1fr_130px_auto] sm:items-center"
                  >
                    <div
                      className="cursor-grab select-none text-center text-xl text-zinc-400"
                      title="Drag to reorder"
                    >
                      ☰
                    </div>

                    <div>
                      <div className="font-semibold">
                        {asset?.name ?? "Unknown asset"}
                      </div>
                      <div className="text-xs text-zinc-500">
                        #{index + 1} · {asset?.orientation ?? "—"} ·{" "}
                        {asset?.type ?? "—"}
                      </div>
                    </div>

                    <label className="grid gap-1">
                      <span className="text-xs text-zinc-500">Duration</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={3600}
                          value={item.durationSec}
                          onChange={(event) =>
                            setDuration(index, Number(event.target.value))
                          }
                          className="h-9 w-20 rounded-lg border border-zinc-300 px-2 text-sm"
                        />
                        <span className="text-xs text-zinc-500">sec</span>
                      </div>
                    </label>

                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(index, index - 1)}
                        disabled={index === 0}
                        className="h-9 w-9 rounded-lg border border-zinc-200 disabled:opacity-30"
                        title="Move up"
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() => moveItem(index, index + 1)}
                        disabled={index === items.length - 1}
                        className="h-9 w-9 rounded-lg border border-zinc-200 disabled:opacity-30"
                        title="Move down"
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="h-9 rounded-lg border border-red-200 px-3 text-sm text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {!items.length ? (
                <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">
                  Add assets above to build this rotation.
                </div>
              ) : null}
            </div>
          </>
        )}

        {message ? (
          <div className="mt-4 text-sm text-zinc-600">{message}</div>
        ) : null}
      </div>
    </section>
  );
}
