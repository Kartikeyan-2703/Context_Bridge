import type { ContextHandoff } from "../src/schema.js";

export const sampleHandoff: ContextHandoff = {
  schemaVersion: "1.0.0",
  handoffId: "handoff-demo-001",
  createdAt: "2026-10-14T18:00:00+05:30",

  project: {
    name: "Demo API",
    repository: "https://example.com/demo-api",
    branch: "feature/fix-api",
    commit: "abc123"
  },

  source: {
    tool: "Codex",
    sessionId: "session-demo-001"
  },

  task: {
    objective: "Fix the API startup error",
    constraints: [
      "Do not change public API response formats"
    ],
    environment: [
      "Node.js",
      "TypeScript",
      "PostgreSQL"
    ]
  },

  summary:
    "Investigated an API startup error and recorded the attempted fix.",

  workDone: [
    "Inspected the controller and route setup",
    "Identified a likely dependency initialization issue"
  ],

  decisions: [
    {
      id: "decision-001",
      decision: "Keep database initialization outside the controller",
      rationale: "Controllers should use an initialized database client",
      evidence: [
        {
          evidenceId: "ev-source-review",
          relation: "supports"
        }
      ]
    }
  ],

  debuggingHistory: [
    {
      id: "attempt-001",
      problem: "Controller failed during startup",
      action: "Inspected dependency initialization",
      outcome: "partially_succeeded",
      result: "The likely source was identified; the fix still needs testing",
      evidence: [
        {
          evidenceId: "ev-source-review",
          relation: "supports"
        }
      ]
    },
    {
      id: "attempt-002",
      problem: "Need to confirm the fix",
      action: "Planned to run the test suite",
      outcome: "unknown",
      result: "Tests have not been run yet",
      evidence: [
        {
          evidenceId: "ev-session-note",
          relation: "context"
        }
      ]
    }
  ],

  changedFiles: [
    {
      path: "src/controllers/demo.controller.ts",
      changeType: "modified",
      summary: "Proposed initialization-related change; review the diff",
      evidence: [
        {
          evidenceId: "ev-git-status",
          relation: "supports"
        }
      ]
    }
  ],

  commands: [
    {
      command: "git status --short",
      purpose: "Inspect repository changes",
      exitCode: 0,
      outcome: "succeeded",
      outputEvidenceIds: ["ev-git-status"]
    }
  ],

  tests: [
    {
      name: "API integration tests",
      status: "not_run",
      details: "Run after reviewing the proposed fix",
      evidence: []
    }
  ],

  currentState: {
    status: "in_progress",
    description:
      "The probable cause has been identified, but the fix is not verified.",
    blockers: [
      "The API fix has not been validated by tests"
    ],
    nextSteps: [
      "Inspect the actual Git diff",
      "Run the relevant tests",
      "Update the handoff with verified results"
    ]
  },

  warnings: [
    "Do not assume the proposed fix works until tests confirm it."
  ],

  evidence: [
    {
      id: "ev-source-review",
      kind: "conversation",
      description: "Recorded explanation of the suspected initialization issue",
      capturedAt: "2026-10-14T17:50:00+05:30",
      source: "Codex session",
      content: "The database client may not have been initialized.",
      verified: false
    },
    {
      id: "ev-session-note",
      kind: "conversation",
      description: "Note that tests remain to be run",
      capturedAt: "2026-10-14T17:55:00+05:30",
      source: "Codex session",
      content: "Tests have not been run yet.",
      verified: false
    },
    {
      id: "ev-git-status",
      kind: "git_status",
      description: "Repository status command completed successfully",
      capturedAt: "2026-10-14T18:00:00+05:30",
      source: "Local Git command",
      content: " M src/controllers/demo.controller.ts",
      verified: true
    }
  ]
};
