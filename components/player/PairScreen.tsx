"use client";

import { useState } from "react";

export default function PairScreen() {
  const [activationCode, setActivationCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair() {
    const code = activationCode.trim().toUpperCase();
    if (!code) return;

    setPairing(true);
    setError(null);
    try {
      const storedDeviceId = window.localStorage.getItem("gspan-screen-device-id");
      const deviceId = storedDeviceId ?? window.crypto.randomUUID();
      const response = await fetch("/api/v1/screens/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activationCode: code, deviceId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Pairing failed");

      window.localStorage.setItem("gspan-screen-device-id", result.deviceId);
      window.localStorage.setItem(`gspan-screen-token:${result.deviceId}`, result.token);
      window.location.assign(`/player/${encodeURIComponent(result.deviceId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pairing failed");
      setPairing(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center overflow-hidden bg-black p-6 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(16,185,129,0.18),transparent_38%)]" />
      <section className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950/90 p-7 shadow-2xl backdrop-blur sm:p-9">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-950 text-sm font-black tracking-tighter text-emerald-100 ring-1 ring-emerald-700/50">
            G·S
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
              G-SPAN Screen Network
            </div>
            <h1 className="text-xl font-semibold">Pair this player</h1>
          </div>
        </div>

        <p className="mt-6 text-sm leading-6 text-zinc-400">
          Enter the one-time code shown beside the screen in the control plane. This browser will claim the screen and begin receiving its active campaign.
        </p>

        <label className="mt-6 grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Activation code
          </span>
          <input
            value={activationCode}
            onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") void pair();
            }}
            autoComplete="one-time-code"
            autoFocus
            maxLength={32}
            placeholder="ABCD2345"
            className="h-16 rounded-2xl border border-zinc-700 bg-black px-5 text-center font-mono text-2xl font-semibold tracking-[0.28em] outline-none transition focus:border-emerald-500"
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <button
          onClick={pair}
          disabled={pairing || !activationCode.trim()}
          className="mt-5 h-12 w-full rounded-2xl bg-emerald-500 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pairing ? "Pairing player…" : "Pair and start playback"}
        </button>
      </section>
    </main>
  );
}
