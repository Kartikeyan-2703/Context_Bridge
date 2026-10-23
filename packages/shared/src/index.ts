export {
  ContextHandoffSchema,
  HandoffStatusSchema,
  EvidenceKindSchema,
  EvidenceSchema,
  EvidenceLinkSchema,
  DecisionSchema,
  DebuggingAttemptSchema,
  ChangedFileSchema,
  CommandRecordSchema,
  TestRecordSchema,
  validateHandoff,
  safeValidateHandoff
} from "./schema.js";

export type {
  ContextHandoff,
  HandoffStatus,
  EvidenceKind,
  Evidence,
  EvidenceLink,
  Decision,
  DebuggingAttempt,
  ChangedFile,
  CommandRecord,
  TestRecord
} from "./schema.js";

export {
  generateHandoffMarkdown,
  generateHandoffJson,
  generateHandoffArtifacts,
  generateEvidenceIndex
} from "./generators.js";

export type {
  HandoffArtifacts
} from "./generators.js";

export {
  NormalizedEventSchema,
  mergeNormalizedEvents,
  normalizeManualTranscript,
  redactSensitiveText,
  redactNormalizedEvent
} from "./normalization.js";

export type { NormalizedEvent } from "./normalization.js";
