"use client";

import { upload } from "@vercel/blob/client";
import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Rendition = {
  id: string;
  url: string;
  width: number;
  height: number;
  codec: string | null;
  filesize: number | null;
};

type Asset = {
  id: string;
  name: string;
  type: "IMAGE" | "VIDEO";
  orientation: "LANDSCAPE" | "PORTRAIT";
  masterUrl: string;
  status: "PROCESSING" | "READY" | "FAILED";
  createdAt: string;
  renditions: Rendition[];
  _count: {
    playlistItems: number;
    creativeVariants: number;
    contentEntries: number;
    logs: number;
  };
};

type QueueStatus =
  | "QUEUED"
  | "UPLOADING"
  | "DONE"
  | "ERROR";

type QueueItem = {
  id: string;
  file: File;
  name: string;
  width: number;
  height: number;
  status: QueueStatus;
  progress: number;
  error?: string;
};

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function prettyName(filename: string) {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");

  const spaced = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) return "Untitled asset";

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function safeFilename(filename: string) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;

  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const result = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };

      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);

      reject(
        new Error(
          `Unable to inspect ${file.name}`,
        ),
      );
    };

    image.src = objectUrl;
  });
}

export default function AssetsPanel({
  initialAssets,
}: {
  initialAssets: Asset[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] =
    useState<Asset[]>(initialAssets);

  const [queue, setQueue] =
    useState<QueueItem[]>([]);

  const [uploadKey, setUploadKey] =
    useState("");

  const [dragging, setDragging] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    const stored =
      window.sessionStorage.getItem(
        "gspan-upload-key",
      );

    if (stored) {
      setUploadKey(stored);
    }
  }, []);

  useEffect(() => {
    if (uploadKey) {
      window.sessionStorage.setItem(
        "gspan-upload-key",
        uploadKey,
      );
    }
  }, [uploadKey]);

  const doneCount = useMemo(
    () =>
      queue.filter(
        (item) => item.status === "DONE",
      ).length,
    [queue],
  );

  function updateQueueItem(
    id: string,
    patch: Partial<QueueItem>,
  ) {
    setQueue((previous) =>
      previous.map((item) =>
        item.id === id
          ? { ...item, ...patch }
          : item,
      ),
    );
  }

  async function prepareFiles(files: File[]) {
    setMessage("");

    const accepted = files.filter((file) =>
      ACCEPTED_TYPES.has(file.type),
    );

    const rejected =
      files.length - accepted.length;

    const prepared: QueueItem[] = [];

    for (const file of accepted) {
      try {
        const dimensions =
          await getImageDimensions(file);

        prepared.push({
          id: crypto.randomUUID(),
          file,
          name: prettyName(file.name),
          width: dimensions.width,
          height: dimensions.height,
          status: "QUEUED",
          progress: 0,
        });
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to inspect image.",
        );
      }
    }

    setQueue((previous) => [
      ...previous,
      ...prepared,
    ]);

    if (rejected > 0) {
      setMessage(
        `${rejected} unsupported file(s) skipped. Use JPEG, PNG or WebP.`,
      );
    }
  }

  async function onFileInput(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    await prepareFiles(
      Array.from(event.target.files ?? []),
    );

    event.target.value = "";
  }

  async function onDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setDragging(false);

    await prepareFiles(
      Array.from(event.dataTransfer.files),
    );
  }

  async function uploadOne(item: QueueItem) {
    updateQueueItem(item.id, {
      status: "UPLOADING",
      progress: 0,
      error: undefined,
    });

    try {
      const filename =
        safeFilename(item.file.name) ||
        `asset-${Date.now()}`;

      const pathname =
        `gspan-assets/${Date.now()}-${filename}`;

      const blob = await upload(
        pathname,
        item.file,
        {
          access: "public",
          handleUploadUrl:
            "/api/admin/assets/upload",

          clientPayload: JSON.stringify({
            uploadKey,
          }),

          multipart:
            item.file.size >
            4 * 1024 * 1024,

          onUploadProgress: (progress) => {
            updateQueueItem(item.id, {
              progress: Math.round(
                progress.percentage,
              ),
            });
          },
        },
      );

      const response = await fetch(
        "/api/admin/assets",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-GSPAN-Upload-Key":
              uploadKey,
          },

          body: JSON.stringify({
            name: item.name.trim(),
            url: blob.url,
            width: item.width,
            height: item.height,
            filesize: item.file.size,
            contentType: item.file.type,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await response.text(),
        );
      }

      const asset: Asset =
        await response.json();

      setAssets((previous) => [
        asset,
        ...previous,
      ]);

      updateQueueItem(item.id, {
        status: "DONE",
        progress: 100,
      });
    } catch (error) {
      updateQueueItem(item.id, {
        status: "ERROR",
        error:
          error instanceof Error
            ? error.message
            : "Upload failed",
      });
    }
  }

  async function uploadAll() {
    if (!uploadKey.trim()) {
      setMessage(
        "Enter the G-SPAN upload key first.",
      );
      return;
    }

    const pending = queue.filter(
      (item) =>
        item.status === "QUEUED" ||
        item.status === "ERROR",
    );

    if (!pending.length) return;

    setUploading(true);
    setMessage("");

    for (const item of pending) {
      await uploadOne(item);
    }

    setUploading(false);
  }

  async function deleteAsset(asset: Asset) {
    if (!uploadKey.trim()) {
      setMessage(
        "Enter the G-SPAN upload key first.",
      );
      return;
    }

    const usage =
      asset._count.playlistItems +
      asset._count.creativeVariants +
      asset._count.contentEntries +
      asset._count.logs;

    if (usage > 0) return;

    if (
      !window.confirm(
        `Delete "${asset.name}" permanently?`,
      )
    ) {
      return;
    }

    const response = await fetch(
      `/api/admin/assets/${asset.id}`,
      {
        method: "DELETE",

        headers: {
          "X-GSPAN-Upload-Key":
            uploadKey,
        },
      },
    );

    if (!response.ok) {
      setMessage(
        await response.text(),
      );
      return;
    }

    setAssets((previous) =>
      previous.filter(
        (item) => item.id !== asset.id,
      ),
    );
  }

  return (
    <div className="grid gap-8">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Upload screen assets
              </h2>

              <p className="mt-1 text-sm text-zinc-600">
                Bulk upload JPEG, PNG and WebP creative.
                Dimensions and orientation are detected automatically.
              </p>
            </div>

            <label className="grid gap-1 lg:w-80">
              <span className="text-xs font-medium text-zinc-500">
                Upload access key
              </span>

              <input
                type="password"
                value={uploadKey}
                onChange={(event) =>
                  setUploadKey(
                    event.target.value,
                  )
                }
                placeholder="G-SPAN upload key"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
              />
            </label>
          </div>

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() =>
              setDragging(false)
            }
            onDrop={onDrop}
            onClick={() =>
              inputRef.current?.click()
            }
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-emerald-600 bg-emerald-50"
                : "border-zinc-300 bg-zinc-50 hover:border-emerald-500 hover:bg-emerald-50/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileInput}
              className="hidden"
            />

            <div className="text-base font-semibold">
              Drop screen graphics here
            </div>

            <div className="mt-1 text-sm text-zinc-500">
              or click to choose multiple files
            </div>

            <div className="mt-3 text-xs text-zinc-400">
              Current preferred format: 1920×1080 landscape WebP
            </div>
          </div>

          {queue.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <div className="grid grid-cols-12 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-500">
                <div className="col-span-5">
                  Asset
                </div>

                <div className="col-span-2">
                  Dimensions
                </div>

                <div className="col-span-2">
                  Size
                </div>

                <div className="col-span-3">
                  Status
                </div>
              </div>

              <div className="divide-y divide-zinc-200">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 items-center gap-3 px-4 py-3"
                  >
                    <div className="col-span-5">
                      <input
                        value={item.name}
                        disabled={
                          item.status ===
                            "UPLOADING" ||
                          item.status ===
                            "DONE"
                        }
                        onChange={(event) =>
                          updateQueueItem(
                            item.id,
                            {
                              name:
                                event.target
                                  .value,
                            },
                          )
                        }
                        className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm font-medium disabled:bg-zinc-50"
                      />

                      <div className="mt-1 truncate text-xs text-zinc-400">
                        {item.file.name}
                      </div>
                    </div>

                    <div className="col-span-2 text-sm">
                      {item.width}×
                      {item.height}
                    </div>

                    <div className="col-span-2 text-sm text-zinc-500">
                      {formatBytes(
                        item.file.size,
                      )}
                    </div>

                    <div className="col-span-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">
                          {item.status}

                          {item.status ===
                          "UPLOADING"
                            ? ` ${item.progress}%`
                            : ""}
                        </span>

                        {item.status !==
                        "UPLOADING" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setQueue(
                                (previous) =>
                                  previous.filter(
                                    (queued) =>
                                      queued.id !==
                                      item.id,
                                  ),
                              )
                            }
                            className="text-xs text-zinc-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>

                      {item.status ===
                      "UPLOADING" ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                          <div
                            className="h-full bg-emerald-600 transition-all"
                            style={{
                              width: `${item.progress}%`,
                            }}
                          />
                        </div>
                      ) : null}

                      {item.error ? (
                        <div className="mt-1 text-xs text-red-700">
                          {item.error}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {queue.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-zinc-500">
                {doneCount}/{queue.length} uploaded
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setQueue((previous) =>
                      previous.filter(
                        (item) =>
                          item.status !==
                          "DONE",
                      ),
                    )
                  }
                  className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
                >
                  Clear completed
                </button>

                <button
                  type="button"
                  onClick={uploadAll}
                  disabled={uploading}
                  className="h-10 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-zinc-200 disabled:text-zinc-500"
                >
                  {uploading
                    ? "Uploading…"
                    : "Upload all"}
                </button>
              </div>
            </div>
          ) : null}

          {message ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              {message}
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Asset Library
            </h2>

            <p className="text-sm text-zinc-500">
              {assets.length} asset(s)
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => {
            const metadata =
              asset.renditions.find(
                (item) =>
                  item.url ===
                  asset.masterUrl,
              ) ??
              asset.renditions[0] ??
              null;

            const usage =
              asset._count.playlistItems +
              asset._count.creativeVariants +
              asset._count.contentEntries +
              asset._count.logs;

            return (
              <article
                key={asset.id}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
              >
                <div className="aspect-video bg-black">
                  {asset.type === "IMAGE" ? (
                    <img
                      src={asset.masterUrl}
                      alt={asset.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-white">
                      VIDEO
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {asset.name}
                      </h3>

                      <div className="mt-1 text-xs text-zinc-500">
                        {asset.orientation}
                        {" · "}
                        {asset.type}
                        {" · "}
                        {asset.status}
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        usage > 0
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {usage > 0
                        ? "IN USE"
                        : "UNUSED"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-zinc-50 p-2">
                      <div className="text-zinc-400">
                        Dimensions
                      </div>

                      <div className="mt-1 font-semibold">
                        {metadata
                          ? `${metadata.width}×${metadata.height}`
                          : "—"}
                      </div>
                    </div>

                    <div className="rounded-lg bg-zinc-50 p-2">
                      <div className="text-zinc-400">
                        Filesize
                      </div>

                      <div className="mt-1 font-semibold">
                        {formatBytes(
                          metadata?.filesize ??
                            null,
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <a
                      href={asset.masterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold hover:bg-zinc-50 hover:no-underline"
                    >
                      Open asset
                    </a>

                    <button
                      type="button"
                      disabled={usage > 0}
                      onClick={() =>
                        deleteAsset(asset)
                      }
                      title={
                        usage > 0
                          ? "Referenced assets cannot be deleted."
                          : "Delete unused asset"
                      }
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {assets.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500">
              No assets yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
