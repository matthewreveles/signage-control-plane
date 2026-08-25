export type TimelinePosition = {
  index: number;
  offsetMs: number;
  remainingMs: number;
  totalMs: number;
};

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
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

export function estimateServerClockOffsetMs({
  requestStartedAtMs,
  responseReceivedAtMs,
  serverNowMs,
}: {
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  serverNowMs: number;
}) {
  const midpointMs = requestStartedAtMs +
    (responseReceivedAtMs - requestStartedAtMs) / 2;
  return serverNowMs - midpointMs;
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
