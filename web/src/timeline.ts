import type { Event } from "./earthquake";

export const PLAYBACK_DURATION_MS = 120_000;

export function sortChronologically(events: Event[]): Event[] {
  return [...events].sort((a, b) =>
    a.occurredAt === b.occurredAt
      ? a.id.localeCompare(b.id)
      : Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
}

export function visibleEventCount(events: Event[], currentTime: string): number {
  const target = Date.parse(currentTime);
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (Date.parse(events[mid].occurredAt) <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function advanceTime(
  current: string,
  start: string,
  end: string,
  speed: number,
  realDeltaMs: number,
): { currentTime: string; complete: boolean } {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const scale = (endMs - startMs) / PLAYBACK_DURATION_MS;
  const next = Math.min(endMs, Math.max(startMs, Date.parse(current) + realDeltaMs * speed * scale));
  return { currentTime: new Date(next).toISOString(), complete: next >= endMs };
}

export function rangeForPreset(preset: "24h" | "7d" | "30d", now = new Date()) {
  const hours = preset === "24h" ? 24 : preset === "7d" ? 168 : 720;
  return {
    startTime: new Date(now.getTime() - hours * 3_600_000).toISOString(),
    endTime: now.toISOString(),
    minMagnitude: preset === "24h" ? 2.5 : preset === "7d" ? 4 : 4.5,
  };
}
