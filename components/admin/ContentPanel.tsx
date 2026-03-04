"use client";

import { useEffect, useMemo, useState } from "react";

type CollectionType = "MENU" | "DROPS" | "EVENTS";
type EntryStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

type AssetLite = { id: string; name: string; type: "IMAGE" | "VIDEO" };

type ContentEntry = {
  id: string;
  collectionId: string;
  title: string;
  body: string | null;
  status: EntryStatus;
  startAt: string | null;
  endAt: string | null;
  assetId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ContentCollection = {
  id: string;
  name: string;
  type: CollectionType;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  entries: ContentEntry[];
};

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fmtWindow(startAt: string | null, endAt: string | null) {
  if (!startAt && !endAt) return "—";
  const s = startAt ? new Date(startAt).toLocaleString() : "—";
  const e = endAt ? new Date(endAt).toLocaleString() : "—";
  return `${s} → ${e}`;
}

function badgeClass(status: EntryStatus) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "ARCHIVED") return "bg-zinc-200 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";
  return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
}

export default function ContentPanel({
  initialCollections,
  assets,
}: {
  initialCollections: ContentCollection[];
  assets: AssetLite[];
}) {
  const [collections, setCollections] = useState<ContentCollection[]>(initialCollections);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCollections[0]?.id ?? null
  );

  const selected = useMemo(
    () => collections.find((c) => c.id === selectedId) ?? null,
    [collections, selectedId]
  );

  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionType, setNewCollectionType] = useState<CollectionType>("MENU");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");

  const [creatingEntry, setCreatingEntry] = useState(false);
  const [newEntryTitle, setNewEntryTitle] = useState("");
  const [newEntryBody, setNewEntryBody] = useState("");
  const [newEntryStart, setNewEntryStart] = useState("");
  const [newEntryEnd, setNewEntryEnd] = useState("");
  const [newEntryAssetId, setNewEntryAssetId] = useState<string>("");

  const [query, setQuery] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);

  const editingEntry = useMemo(() => {
    if (!selected) return null;
    return selected.entries.find((e) => e.id === editEntryId) ?? null;
  }, [selected, editEntryId]);

  useEffect(() => {
    if (!selectedId && collections.length) setSelectedId(collections[0].id);
  }, [selectedId, collections]);

  const filteredEntries = useMemo(() => {
    if (!selected) return [];
    const q = query.trim().toLowerCase();
    if (!q) return selected.entries;

    return selected.entries.filter((e) => {
      return (
        e.title.toLowerCase().includes(q) ||
        (e.body ?? "").toLowerCase().includes(q) ||
        e.status.toLowerCase().includes(q)
      );
    });
  }, [selected, query]);

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name) return;

    setCreatingCollection(true);
    try {
      const created = await api<ContentCollection>("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: newCollectionType,
          description: newCollectionDesc.trim() || null,
        }),
      });

      // server returns collection without entries; normalize locally
      const normalized: ContentCollection = {
        ...created,
        entries: [],
      };

      setCollections((prev) => [...prev, normalized]);
      setSelectedId(created.id);
      setNewCollectionName("");
      setNewCollectionDesc("");
      setNewCollectionType("MENU");
    } finally {
      setCreatingCollection(false);
    }
  }

  async function createDefaults() {
    const wanted: Array<{ name: string; type: CollectionType; description: string }> = [
      { name: "Mesa Menu", type: "MENU", description: "Menu-oriented updates and highlights." },
      { name: "Vendor Drops", type: "DROPS", description: "Drops, restocks, limited runs." },
      { name: "Store Events", type: "EVENTS", description: "In-store events and promos." },
    ];

    const existingNames = new Set(collections.map((c) => c.name.toLowerCase()));
    for (const w of wanted) {
      if (existingNames.has(w.name.toLowerCase())) continue;
      // eslint-disable-next-line no-await-in-loop
      const created = await api<ContentCollection>("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(w),
      });
      setCollections((prev) => [...prev, { ...created, entries: [] }]);
    }
    if (!selectedId) {
      const next = collections[0]?.id;
      if (next) setSelectedId(next);
    }
  }

  async function createEntry() {
    if (!selected) return;
    const title = newEntryTitle.trim();
    if (!title) return;

    setCreatingEntry(true);
    try {
      const created = await api<ContentEntry>(
        `/api/admin/collections/${selected.id}/entries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body: newEntryBody.trim() || null,
            startAt: fromLocalInputValue(newEntryStart),
            endAt: fromLocalInputValue(newEntryEnd),
            assetId: newEntryAssetId || null,
          }),
        }
      );

      setCollections((prev) =>
        prev.map((c) =>
          c.id === selected.id
            ? { ...c, entries: [created, ...c.entries] }
            : c
        )
      );

      setNewEntryTitle("");
      setNewEntryBody("");
      setNewEntryStart("");
      setNewEntryEnd("");
      setNewEntryAssetId("");
    } finally {
      setCreatingEntry(false);
    }
  }

  async function patchEntry(entryId: string, patch: Partial<ContentEntry>) {
    if (!selected) return;

    const updated = await api<ContentEntry>(
      `/api/admin/collections/${selected.id}/entries/${entryId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }
    );

    setCollections((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? {
              ...c,
              entries: c.entries.map((e) => (e.id === entryId ? updated : e)),
            }
          : c
      )
    );

    return updated;
  }

  async function deleteEntry(entryId: string) {
    if (!selected) return;

    await api<{ ok: true }>(
      `/api/admin/collections/${selected.id}/entries/${entryId}`,
      { method: "DELETE" }
    );

    setCollections((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? { ...c, entries: c.entries.filter((e) => e.id !== entryId) }
          : c
      )
    );
  }

  function openEdit(entryId: string) {
    setEditEntryId(entryId);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditEntryId(null);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight">Collections</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Vendor-friendly structured inputs that can be rendered on screens without exporting new graphics.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-12">
          {/* Left: Collections list */}
          <div className="md:col-span-4">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Your collections</div>
                <button
                  onClick={createDefaults}
                  className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
                >
                  Create defaults
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                {collections.length === 0 ? (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">
                    No collections yet.
                  </div>
                ) : (
                  collections.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={[
                        "w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                        c.id === selectedId
                          ? "border-zinc-50 bg-zinc-50 text-zinc-900 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                          : "border-zinc-800 bg-black text-zinc-50 hover:bg-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900",
                      ].join(" ")}
                    >
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs opacity-80">{c.type}</div>
                    </button>
                  ))
                )}
              </div>

              <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div className="text-sm font-semibold">Create collection</div>

                <div className="mt-2 grid gap-2">
                  <input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Mesa Menu"
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                  />

                  <select
                    value={newCollectionType}
                    onChange={(e) => setNewCollectionType(e.target.value as CollectionType)}
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                  >
                    <option value="MENU">MENU</option>
                    <option value="DROPS">DROPS</option>
                    <option value="EVENTS">EVENTS</option>
                  </select>

                  <textarea
                    value={newCollectionDesc}
                    onChange={(e) => setNewCollectionDesc(e.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                  />

                  <button
                    onClick={createCollection}
                    disabled={creatingCollection}
                    className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
                  >
                    {creatingCollection ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Entries */}
          <div className="md:col-span-8">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              {!selected ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Select a collection to manage entries.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold">{selected.name}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {selected.type} · {selected.description ?? "No description"}
                        </div>
                      </div>

                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search entries…"
                        className="h-10 w-full max-w-xs rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                      />
                    </div>
                  </div>

                  {/* Create entry */}
                  <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="text-sm font-semibold">Create entry</div>

                    <div className="mt-2 grid gap-2">
                      <input
                        value={newEntryTitle}
                        onChange={(e) => setNewEntryTitle(e.target.value)}
                        placeholder="Title"
                        className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                      />

                      <textarea
                        value={newEntryBody}
                        onChange={(e) => setNewEntryBody(e.target.value)}
                        placeholder="Body (optional)"
                        rows={4}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                      />

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">Start (optional)</span>
                          <input
                            type="datetime-local"
                            value={newEntryStart}
                            onChange={(e) => setNewEntryStart(e.target.value)}
                            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                          />
                        </label>

                        <label className="grid gap-1">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">End (optional)</span>
                          <input
                            type="datetime-local"
                            value={newEntryEnd}
                            onChange={(e) => setNewEntryEnd(e.target.value)}
                            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                          />
                        </label>
                      </div>

                      <label className="grid gap-1">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Optional asset
                        </span>
                        <select
                          value={newEntryAssetId}
                          onChange={(e) => setNewEntryAssetId(e.target.value)}
                          className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
                        >
                          <option value="">None</option>
                          {assets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.type})
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        onClick={createEntry}
                        disabled={creatingEntry}
                        className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
                      >
                        {creatingEntry ? "Creating…" : "Create entry (Draft)"}
                      </button>
                    </div>
                  </div>

                  {/* Entries list */}
                  <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="grid grid-cols-12 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 dark:bg-black dark:text-zinc-400">
                      <div className="col-span-5">Entry</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-3">Window</div>
                      <div className="col-span-2">Actions</div>
                    </div>

                    {filteredEntries.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
                        No entries.
                      </div>
                    ) : (
                      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {filteredEntries.map((e) => (
                          <li key={e.id} className="grid grid-cols-12 px-4 py-3">
                            <div className="col-span-5">
                              <div className="text-sm font-semibold">{e.title}</div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                {e.body ?? "—"}
                              </div>
                            </div>

                            <div className="col-span-2 flex items-center">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass(e.status)}`}>
                                {e.status}
                              </span>
                            </div>

                            <div className="col-span-3 flex items-center text-xs text-zinc-600 dark:text-zinc-400">
                              {fmtWindow(e.startAt, e.endAt)}
                            </div>

                            <div className="col-span-2 flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEdit(e.id)}
                                className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
                              >
                                Edit
                              </button>

                              {e.status !== "APPROVED" ? (
                                <button
                                  onClick={() => patchEntry(e.id, { status: "APPROVED" })}
                                  className="h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
                                >
                                  Approve
                                </button>
                              ) : (
                                <button
                                  onClick={() => patchEntry(e.id, { status: "ARCHIVED" })}
                                  className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
                                >
                                  Archive
                                </button>
                              )}

                              <button
                                onClick={() => deleteEntry(e.id)}
                                className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-800 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Edit modal */}
        {editOpen && selected && editingEntry ? (
          <EditEntryModal
            entry={editingEntry}
            assets={assets}
            onClose={closeEdit}
            onSave={async (patch) => {
              await patchEntry(editingEntry.id, patch);
              closeEdit();
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function EditEntryModal({
  entry,
  assets,
  onClose,
  onSave,
}: {
  entry: ContentEntry;
  assets: AssetLite[];
  onClose: () => void;
  onSave: (patch: Partial<ContentEntry>) => Promise<void>;
}) {
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body ?? "");
  const [status, setStatus] = useState<EntryStatus>(entry.status);

  const [startAt, setStartAt] = useState(entry.startAt ? toLocalInputValue(entry.startAt) : "");
  const [endAt, setEndAt] = useState(entry.endAt ? toLocalInputValue(entry.endAt) : "");
  const [assetId, setAssetId] = useState(entry.assetId ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const t = title.trim();
    if (!t) {
      setError("Title is required.");
      return;
    }

    const sIso = fromLocalInputValue(startAt);
    const eIso = fromLocalInputValue(endAt);
    if (sIso && eIso && new Date(eIso) <= new Date(sIso)) {
      setError("End must be after start.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: t,
        body: body.trim() || null,
        status,
        startAt: sIso,
        endAt: eIso,
        assetId: assetId || null,
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to save.");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />

      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Edit entry</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Draft → Approve → Archive workflow.
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-black"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Start (optional)</span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">End (optional)</span>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EntryStatus)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="APPROVED">APPROVED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Optional asset</span>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none dark:border-zinc-800 dark:bg-black"
              >
                <option value="">None</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-black dark:hover:bg-zinc-900"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}