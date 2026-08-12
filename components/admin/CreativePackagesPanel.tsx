"use client";

import { useMemo, useState } from "react";

type Destination = "SIGNAGE" | "REVIVE";
type PackageStatus = "DRAFT" | "PROCESSING" | "REVIEW" | "APPROVED" | "FAILED";

type Preset = { key: string; label: string; width: number; height: number };
type Presets = Record<Destination, readonly Preset[]>;

type CreativeVariant = {
  id: string;
  destination: Destination;
  presetKey: string;
  width: number;
  height: number;
  asset: {
    id: string;
    name: string;
    type: "IMAGE" | "VIDEO";
    masterUrl: string;
    status: "PROCESSING" | "READY" | "FAILED";
  };
};

type CreativePackage = {
  id: string;
  name: string;
  brand: string;
  campaignMessage: string | null;
  cta: string | null;
  sourceSystem: string;
  sourceJobId: string | null;
  status: PackageStatus;
  createdAt: string;
  variants: CreativeVariant[];
};

function statusClass(status: PackageStatus) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (status === "REVIEW") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (status === "FAILED") return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
  return "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
}

function makeExample(presets: Presets) {
  return JSON.stringify(
    {
      name: "Arizona launch package",
      brand: "Example Brand",
      campaignMessage: "One source product. Every screen and ad size.",
      cta: "Shop now",
      sourceSystem: "GSPAN_AI_FACTORY",
      sourceJobId: "factory-job-example",
      status: "REVIEW",
      variants: [...presets.SIGNAGE, ...presets.REVIVE].map((preset) => ({
        destination: preset.key.startsWith("SIGNAGE") ? "SIGNAGE" : "REVIVE",
        presetKey: preset.key,
        name: `Example Brand — ${preset.label}`,
        type: "IMAGE",
        url: `https://assets.example.com/factory-job-example/${preset.key.toLowerCase()}.png`,
      })),
    },
    null,
    2,
  );
}

export default function CreativePackagesPanel({
  initialPackages,
  presets,
}: {
  initialPackages: CreativePackage[];
  presets: Presets;
}) {
  const [packages, setPackages] = useState(initialPackages);
  const [manifest, setManifest] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvedCount = packages.filter((item) => item.status === "APPROVED").length;
  const reviewCount = packages.filter((item) => item.status === "REVIEW").length;
  const totalVariants = useMemo(
    () => packages.reduce((sum, item) => sum + item.variants.length, 0),
    [packages],
  );

  async function importPackage() {
    setError(null);
    let body: unknown;
    try {
      body = JSON.parse(manifest);
    } catch {
      setError("The manifest is not valid JSON.");
      return;
    }

    setImporting(true);
    try {
      const response = await fetch("/api/admin/creative-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Package import failed");
      setPackages((current) => [result, ...current]);
      setManifest("");
      setShowImport(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Package import failed");
    } finally {
      setImporting(false);
    }
  }

  async function setStatus(id: string, status: PackageStatus) {
    setError(null);
    const response = await fetch(`/api/admin/creative-packages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Package update failed");
      return;
    }
    setPackages((current) => current.map((item) => (item.id === id ? result : item)));
  }

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-900/20 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_38%),linear-gradient(135deg,#07110d,#101714)] p-6 text-white shadow-xl sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              AI Factory → Screen Network
            </div>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              One approved creative direction, resolved for every destination.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
              Factory jobs arrive as packages—not loose files. The control plane preserves the campaign relationship, verifies coverage and chooses the correct variant for each screen at playback.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              [packages.length, "Packages"],
              [approvedCount, "Approved"],
              [totalVariants, "Variants"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-zinc-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {(Object.entries(presets) as Array<[Destination, readonly Preset[]]>).map(([destination, items]) => (
          <div key={destination} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Preset family</div>
                <h3 className="mt-1 text-lg font-semibold">{destination === "SIGNAGE" ? "Screen Network" : "Revive display"}</h3>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold dark:bg-zinc-900">{items.length} outputs</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {items.map((preset) => (
                <div key={preset.key} className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                  <div>
                    <div className="text-sm font-medium">{preset.label}</div>
                    <div className="text-xs text-zinc-500">{preset.key}</div>
                  </div>
                  <code className="text-xs text-zinc-600 dark:text-zinc-300">{preset.width}×{preset.height}</code>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Factory package queue</h3>
              {reviewCount ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{reviewCount} awaiting review</span> : null}
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Review screen coverage before releasing a package to Campaigns.
            </p>
          </div>
          <button
            onClick={() => setShowImport((value) => !value)}
            className="h-10 rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"
          >
            {showImport ? "Close import" : "Import Factory manifest"}
          </button>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div> : null}

        {showImport ? (
          <div className="mt-5 grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Factory handoff manifest</div>
                <div className="text-xs text-zinc-500">Paste the completed job manifest with public asset URLs.</div>
              </div>
              <button
                onClick={() => setManifest(makeExample(presets))}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
              >
                Load contract example
              </button>
            </div>
            <textarea
              value={manifest}
              onChange={(event) => setManifest(event.target.value)}
              rows={18}
              spellCheck={false}
              placeholder="Paste a G-SPAN AI Factory creative-package manifest…"
              className="w-full rounded-xl border border-zinc-300 bg-white p-4 font-mono text-xs leading-5 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <div className="flex justify-end">
              <button
                onClick={importPackage}
                disabled={importing || !manifest.trim()}
                className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import for review"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          {packages.map((creativePackage) => {
            const signage = creativePackage.variants.filter((variant) => variant.destination === "SIGNAGE");
            const revive = creativePackage.variants.filter((variant) => variant.destination === "REVIVE");
            const hasLandscape = signage.some((variant) => variant.width >= variant.height);
            const hasPortrait = signage.some((variant) => variant.height > variant.width);

            return (
              <article key={creativePackage.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(creativePackage.status)}`}>{creativePackage.status}</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{creativePackage.sourceSystem}</span>
                    </div>
                    <h4 className="mt-2 text-lg font-semibold">{creativePackage.brand} — {creativePackage.name}</h4>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{creativePackage.campaignMessage ?? "No campaign message supplied."}</p>
                    <div className="mt-2 text-xs text-zinc-500">Factory job: {creativePackage.sourceJobId ?? "not supplied"} · CTA: {creativePackage.cta ?? "none"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {creativePackage.status !== "APPROVED" ? (
                      <button onClick={() => setStatus(creativePackage.id, "APPROVED")} className="h-9 rounded-xl bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-600">Approve package</button>
                    ) : (
                      <button onClick={() => setStatus(creativePackage.id, "REVIEW")} className="h-9 rounded-xl border border-zinc-300 px-3 text-sm font-medium dark:border-zinc-700">Return to review</button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Coverage label="Landscape" value={hasLandscape ? "Ready" : "Missing"} ready={hasLandscape} />
                  <Coverage label="Portrait" value={hasPortrait ? "Ready" : "Missing"} ready={hasPortrait} />
                  <Coverage label="Screen variants" value={String(signage.length)} ready={signage.length > 0} />
                  <Coverage label="Revive variants" value={String(revive.length)} ready={revive.length > 0} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {creativePackage.variants.map((variant) => (
                    <span key={variant.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                      {variant.destination} · {variant.width}×{variant.height}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}

          {packages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
              <div className="text-sm font-semibold">No Factory packages have arrived yet.</div>
              <div className="mt-1 text-sm text-zinc-500">Import a manifest to test the complete review-to-campaign handoff.</div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Coverage({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${ready ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{value}</div>
    </div>
  );
}
