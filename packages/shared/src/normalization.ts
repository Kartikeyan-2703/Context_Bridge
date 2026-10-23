import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);
const IsoDateTime = z.iso.datetime({ offset: true });

export const NormalizedEventSchema = z.object({
  id: NonEmptyString,
  source: NonEmptyString,
  kind: z.enum(["message", "tool_call", "tool_result", "error", "file_reference", "note"]),
  capturedAt: IsoDateTime.optional(),
  content: z.string().max(200_000).optional(),
  references: z.array(NonEmptyString).default([]),
  metadata: z.record(z.string(), z.string()).default({})
}).strict();

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

/** Redacts common credential forms before any artifact is written or transmitted. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s'"`]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|pk|ghp|github_pat)_[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]");
}

export function redactNormalizedEvent(event: NormalizedEvent): NormalizedEvent {
  return {
    ...event,
    ...(event.content === undefined ? {} : { content: redactSensitiveText(event.content) }),
    metadata: Object.fromEntries(
      Object.entries(event.metadata).map(([key, value]) => [
        key,
        /(?:api[_-]?key|token|password|secret|credential)/i.test(key)
          ? "[REDACTED]"
          : redactSensitiveText(value)
      ])
    )
  };
}

/** Merges independently captured records without silently resolving conflicts. */
export function mergeNormalizedEvents(eventGroups: readonly NormalizedEvent[][]): NormalizedEvent[] {
  return eventGroups
    .flat()
    .map((event, index) => ({ event: redactNormalizedEvent(NormalizedEventSchema.parse(event)), index }))
    .sort((left, right) => {
      const leftTime = left.event.capturedAt ? Date.parse(left.event.capturedAt) : Number.POSITIVE_INFINITY;
      const rightTime = right.event.capturedAt ? Date.parse(right.event.capturedAt) : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || left.index - right.index;
    })
    .map(({ event }) => event);
}

/** Generic manual transcript import. Tool-specific parsers belong outside shared. */
export function normalizeManualTranscript(source: string, content: string, capturedAt?: string): NormalizedEvent[] {
  const timestamp = capturedAt === undefined ? undefined : IsoDateTime.parse(capturedAt);
  if (!content.trim()) {
    throw new Error("A manual transcript must contain non-whitespace content.");
  }

  const event = NormalizedEventSchema.parse({
    id: `manual-${createStableId(source, content)}`,
    source,
    kind: "message",
    content: redactSensitiveText(content),
    ...(timestamp === undefined ? {} : { capturedAt: timestamp }),
    references: [],
    metadata: { import: "manual transcript" }
  });

  return [redactNormalizedEvent(event)];
}

function createStableId(source: string, content: string): string {
  let hash = 2166136261;
  for (const character of `${source}\u0000${content}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
