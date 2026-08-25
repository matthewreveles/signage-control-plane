export type TimelinePosition = {
  index: number;
  offsetMs: number;
  remainingMs: number;
  totalMs: number;
};

export type ClockSample = {
  offsetMs: number;
  roundTripMs: number;
  observedAtMs: number;
};

export type DriftCorrection =
  | { mode: "NONE"; playbackRate: 1 }
  | { mode: "SOFT"; playbackRate: number }
  | { mode: "HARD"; playbackRate: 1 };

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

export function monotonicEpochNowMs() {
  if (
    typeof performance !== "undefined" &&
    Number.isFinite(performance.timeOrigin) &&
    typeof performance.now === "function"
  ) {
    return performance.timeOrigin + performance.now();
  }

  return Date.now();
}

export function timelineDurationMs(
  items: Array<{ durationSeconds: number }>,
) {
  return items.reduce(
    (total, item) => total + Math.max(1, item.durationSeconds) * 1000,
    0,
  );
}

export function resolveTimelinePosition(
  items: Array<{ durationSeconds: number }>,
  elapsedMs: number,
): TimelinePosition | null {
  const totalMs = timelineDurationMs(items);
  if (!items.length || totalMs <= 0) return null;

  const phaseMs = positiveModulo(elapsedMs, totalMs);
  let cursorMs = 0;

  for (let index = 0; index < items.length; index += 1) {
    const durationMs = Math.max(1, items[index].durationSeconds) * 1000;
    const endMs = cursorMs + durationMs;

    if (phaseMs < endMs || index === items.length - 1) {
      const offsetMs = Math.max(0, phaseMs - cursorMs);
      return {
        index,
        offsetMs,
        remainingMs: Math.max(1, durationMs - offsetMs),
        totalMs,
      };
    }

    cursorMs = endMs;
  }

  return null;
}

export function clockSample({
  requestStartedAtMs,
  responseReceivedAtMs,
  serverNowMs,
}: {
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  serverNowMs: number;
}): ClockSample {
  const roundTripMs = Math.max(0, responseReceivedAtMs - requestStartedAtMs);
  const midpointMs = requestStartedAtMs + roundTripMs / 2;

  return {
    offsetMs: serverNowMs - midpointMs,
    roundTripMs,
    observedAtMs: responseReceivedAtMs,
  };
}

export function estimateServerClockOffsetMs(args: {
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  serverNowMs: number;
}) {
  return clockSample(args).offsetMs;
}

/**
 * Use the median offset from the lowest-RTT samples. Network delay is usually
 * asymmetric, so blindly trusting the newest request lets one slow response
 * jerk the wall clock. Keeping the best samples makes clock correction stable
 * while still allowing it to adapt as the network changes.
 */
export function stableServerClockOffsetMs(samples: ClockSample[]) {
  const usable = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.offsetMs) &&
        Number.isFinite(sample.roundTripMs) &&
        sample.roundTripMs >= 0,
    )
    .sort((a, b) => a.roundTripMs - b.roundTripMs)
    .slice(0, 5);

  if (!usable.length) return 0;

  const offsets = usable.map((sample) => sample.offsetMs).sort((a, b) => a - b);
  const middle = Math.floor(offsets.length / 2);

  return offsets.length % 2
    ? offsets[middle]
    : (offsets[middle - 1] + offsets[middle]) / 2;
}

export function driftCorrection({
  signedDriftMs,
  toleranceMs,
  hardResyncMs,
}: {
  signedDriftMs: number;
  toleranceMs: number;
  hardResyncMs: number;
}): DriftCorrection {
  const magnitude = Math.abs(signedDriftMs);

  if (magnitude <= Math.max(1, toleranceMs)) {
    return { mode: "NONE", playbackRate: 1 };
  }

  if (magnitude >= Math.max(toleranceMs + 1, hardResyncMs)) {
    return { mode: "HARD", playbackRate: 1 };
  }

  // Small drift is corrected gradually so the viewer does not see repeated
  // hard seeks. Cap correction at ±2% to keep motion visually natural.
  const normalized = Math.min(1, magnitude / Math.max(1, hardResyncMs));
  const adjustment = 0.005 + normalized * 0.015;

  return {
    mode: "SOFT",
    playbackRate:
      signedDriftMs < 0
        ? 1 + adjustment
        : 1 - adjustment,
  };
}

export function expectedWallPosition({
  items,
  epochMs,
  localNowMs,
  clockOffsetMs,
}: {
  items: Array<{ durationSeconds: number }>;
  epochMs: number;
  localNowMs: number;
  clockOffsetMs: number;
}) {
  const serverNowEstimateMs = localNowMs + clockOffsetMs;
  return resolveTimelinePosition(items, serverNowEstimateMs - epochMs);
}
