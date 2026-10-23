# Privacy and security

All CLI inspection and default artifact generation are local. Git evidence collection filters obvious sensitive paths, and generators redact common token, password, and private-key patterns. This is not a substitute for reviewing the handoff before sharing it.

No extension or CLI includes an LLM API key. Browser capture is user-triggered and no browser content is uploaded. The API accepts records only after a caller sets explicit consent, keeps credential configuration server-side, limits request size, and does not log raw prompts by default.

Captured text, repository paths, model output, and transcripts are untrusted data. Context Bridge never executes instructions from them and never overwrites project source code automatically.
