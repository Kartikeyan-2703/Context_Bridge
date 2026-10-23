import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);
const IsoDateTime = z.iso.datetime({ offset: true });
const EvidenceId = z.string().trim().min(1).max(160);

export const HandoffStatusSchema = z.enum([
  "completed",
  "in_progress",
  "blocked",
  "unverified"
]);

export const EvidenceKindSchema = z.enum([
  "conversation",
  "command_output",
  "test_result",
  "git_diff",
  "git_status",
  "file_snapshot",
  "error_log",
  "manual_observation",
  "other"
]);

export const AttemptOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "partially_succeeded",
  "unknown"
]);

export const EvidenceSchema = z.object({
  id: EvidenceId,
  kind: EvidenceKindSchema,
  description: NonEmptyString,
  capturedAt: IsoDateTime,
  source: NonEmptyString,
  content: z.string().max(200_000).optional(),
  uri: z.string().max(4_096).optional(),
  verified: z.boolean().default(false),
  integrity: z.object({
    algorithm: z.enum(["sha256"]),
    digest: z.string().regex(/^[a-f0-9]{64}$/i)
  }).strict().optional()
}).strict();

export const EvidenceLinkSchema = z.object({
  evidenceId: EvidenceId,
  relation: z.enum([
    "supports",
    "contradicts",
    "context"
  ]).default("supports")
}).strict();

export const DecisionSchema = z.object({
  id: NonEmptyString,
  decision: NonEmptyString,
  rationale: z.string().optional(),
  evidence: z.array(EvidenceLinkSchema).default([])
}).strict();

export const DebuggingAttemptSchema = z.object({
  id: NonEmptyString,
  problem: NonEmptyString,
  action: NonEmptyString,
  outcome: AttemptOutcomeSchema,
  result: z.string().optional(),
  evidence: z.array(EvidenceLinkSchema).default([])
}).strict();

export const ChangedFileSchema = z.object({
  path: NonEmptyString,
  changeType: z.enum([
    "added",
    "modified",
    "deleted",
    "renamed",
    "unknown"
  ]),
  summary: z.string().optional(),
  evidence: z.array(EvidenceLinkSchema).default([])
}).strict();

export const CommandRecordSchema = z.object({
  command: NonEmptyString,
  purpose: z.string().optional(),
  exitCode: z.number().int().optional(),
  outcome: AttemptOutcomeSchema,
  outputEvidenceIds: z.array(EvidenceId).default([])
}).strict();

export const TestRecordSchema = z.object({
  name: NonEmptyString,
  status: z.enum([
    "passed",
    "failed",
    "not_run",
    "unknown"
  ]),
  details: z.string().optional(),
  evidence: z.array(EvidenceLinkSchema).default([])
}).strict();

export const ContextHandoffSchema = z.object({
  schemaVersion: z.literal("1.0.0"),

  handoffId: NonEmptyString,
  createdAt: IsoDateTime,

  project: z.object({
    name: NonEmptyString,
    repository: z.string().optional(),
    branch: z.string().optional(),
    commit: z.string().optional()
  }).strict(),

  source: z.object({
    tool: NonEmptyString,
    sessionId: z.string().optional(),
    sessionUri: z.string().optional()
  }).strict(),

  task: z.object({
    objective: NonEmptyString,
    constraints: z.array(NonEmptyString).default([]),
    environment: z.array(NonEmptyString).default([])
  }).strict(),

  summary: NonEmptyString,

  workDone: z.array(NonEmptyString).default([]),

  decisions: z.array(DecisionSchema).default([]),

  debuggingHistory: z.array(DebuggingAttemptSchema).default([]),

  changedFiles: z.array(ChangedFileSchema).default([]),

  commands: z.array(CommandRecordSchema).default([]),

  tests: z.array(TestRecordSchema).default([]),

  currentState: z.object({
    status: HandoffStatusSchema,
    description: NonEmptyString,
    blockers: z.array(NonEmptyString).default([]),
    nextSteps: z.array(NonEmptyString).default([])
  }).strict(),

  warnings: z.array(NonEmptyString).default([]),

  evidence: z.array(EvidenceSchema).default([])
}).strict().superRefine((handoff, ctx) => {
  const evidenceIds = new Set<string>();

  for (const [index, item] of handoff.evidence.entries()) {
    if (evidenceIds.has(item.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence", index, "id"],
        message: `Duplicate evidence ID: ${item.id}`
      });
    }

    evidenceIds.add(item.id);
  }

  function checkEvidenceLink(
    evidenceId: string,
    path: (string | number)[]
  ) {
    if (!evidenceIds.has(evidenceId)) {
      ctx.addIssue({
        code: "custom",
        path,
        message: `Evidence reference "${evidenceId}" does not exist`
      });
    }
  }

  handoff.decisions.forEach((decision, decisionIndex) => {
    decision.evidence.forEach((link, linkIndex) => {
      checkEvidenceLink(link.evidenceId, [
        "decisions",
        decisionIndex,
        "evidence",
        linkIndex,
        "evidenceId"
      ]);
    });
  });

  handoff.debuggingHistory.forEach((attempt, attemptIndex) => {
    attempt.evidence.forEach((link, linkIndex) => {
      checkEvidenceLink(link.evidenceId, [
        "debuggingHistory",
        attemptIndex,
        "evidence",
        linkIndex,
        "evidenceId"
      ]);
    });
  });

  handoff.changedFiles.forEach((file, fileIndex) => {
    file.evidence.forEach((link, linkIndex) => {
      checkEvidenceLink(link.evidenceId, [
        "changedFiles",
        fileIndex,
        "evidence",
        linkIndex,
        "evidenceId"
      ]);
    });
  });

  handoff.commands.forEach((command, commandIndex) => {
    command.outputEvidenceIds.forEach((evidenceId, evidenceIndex) => {
      checkEvidenceLink(evidenceId, [
        "commands",
        commandIndex,
        "outputEvidenceIds",
        evidenceIndex
      ]);
    });
  });

  handoff.tests.forEach((test, testIndex) => {
    test.evidence.forEach((link, linkIndex) => {
      checkEvidenceLink(link.evidenceId, [
        "tests",
        testIndex,
        "evidence",
        linkIndex,
        "evidenceId"
      ]);
    });
  });

  const verifiedEvidenceIds = new Set(
    handoff.evidence
      .filter((item) => item.verified)
      .map((item) => item.id)
  );

  handoff.tests.forEach((test, testIndex) => {
    if (test.status !== "passed") {
      return;
    }

    const hasVerifiedEvidence = test.evidence.some(
      (link) =>
        link.relation === "supports" &&
        verifiedEvidenceIds.has(link.evidenceId) &&
        handoff.evidence.find((evidence) => evidence.id === link.evidenceId)?.kind === "test_result"
    );

    if (!hasVerifiedEvidence) {
      ctx.addIssue({
        code: "custom",
        path: ["tests", testIndex, "status"],
        message:
          'A test cannot be marked "passed" without verified supporting evidence'
      });
    }
  });

  handoff.commands.forEach((command, commandIndex) => {
    if (command.outcome === "succeeded" && command.exitCode !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["commands", commandIndex, "exitCode"],
        message: "A successful command must have exit code 0"
      });
    }

    if (command.outcome === "failed" && command.exitCode === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["commands", commandIndex, "exitCode"],
        message: "A failed command cannot have exit code 0"
      });
    }

    if (command.outcome !== "succeeded") {
      return;
    }

    const hasVerifiedOutput = command.outputEvidenceIds.some(
      (id) => {
        const evidence = handoff.evidence.find((item) => item.id === id);
        return verifiedEvidenceIds.has(id) && evidence !== undefined && [
          "command_output",
          "git_status",
          "git_diff"
        ].includes(evidence.kind);
      }
    );

    if (!hasVerifiedOutput) {
      ctx.addIssue({
        code: "custom",
        path: ["commands", commandIndex, "outcome"],
        message:
          'A command cannot be marked "succeeded" without verified output evidence'
      });
    }
  });

  if (handoff.currentState.status === "blocked" && handoff.currentState.blockers.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["currentState", "blockers"],
      message: "A blocked handoff must record at least one blocker"
    });
  }

  if (handoff.currentState.status === "completed") {
    if (handoff.currentState.blockers.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["currentState", "blockers"],
        message: "A completed handoff cannot include active blockers"
      });
    }

    if (verifiedEvidenceIds.size === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["currentState", "status"],
        message: "A completed handoff requires at least one verified evidence record"
      });
    }
  }
});

export type HandoffStatus = z.infer<typeof HandoffStatusSchema>;
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type DebuggingAttempt = z.infer<typeof DebuggingAttemptSchema>;
export type ChangedFile = z.infer<typeof ChangedFileSchema>;
export type CommandRecord = z.infer<typeof CommandRecordSchema>;
export type TestRecord = z.infer<typeof TestRecordSchema>;
export type ContextHandoff = z.infer<typeof ContextHandoffSchema>;

export function validateHandoff(input: unknown): ContextHandoff {
  return ContextHandoffSchema.parse(input);
}

export function safeValidateHandoff(input: unknown) {
  return ContextHandoffSchema.safeParse(input);
}
