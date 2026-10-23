# Backend setup

The backend is optional. Local CLI handoffs work without it.

```powershell
# apps\api\.env.example is a reference file; this service does not load .env automatically.
$env:CONTEXT_BRIDGE_PROVIDER_API_KEY = "your-provider-key"
$env:CONTEXT_BRIDGE_PROVIDER_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/"
$env:CONTEXT_BRIDGE_PROVIDER_MODEL = "gemini-3.8-flash"
$env:CONTEXT_BRIDGE_API_TOKEN = "a-random-local-token-with-at-least-32-characters"
npm.cmd run build --workspace @context-bridge/api
npm.cmd run start --workspace @context-bridge/api
```

`CONTEXT_BRIDGE_API_TOKEN` is required at startup, must be 32–512 non-whitespace characters, and is distinct from `CONTEXT_BRIDGE_PROVIDER_API_KEY`. Use a cryptographically random local value, rotate it by replacing the value and restarting the API, and never place it in a Chrome or VS Code extension bundle. The current clients do not call the hosted API; a future extension pairing flow must not embed this token.

The API binds only to `127.0.0.1`; `CONTEXT_BRIDGE_HOST` rejects every other value. `GET /health` is deliberately unauthenticated and returns only `{ "status": "ok" }`; every other API endpoint requires `Authorization: Bearer <CONTEXT_BRIDGE_API_TOKEN>`. No CORS origin is enabled because the current browser and VS Code integrations do not submit to the backend. Loopback binding reduces network exposure but does not protect against malicious local processes or browser interactions.

`POST /v1/handoffs/extract` requires `consentToUpload: true`, a task objective, and normalized records. Requests must use `application/json`; the default body limit is 256,000 bytes and provider/API output is limited to 1,000,000 bytes. The default provider timeout is 30 seconds. Credential-like values are redacted before provider submission and response export, raw prompts are not logged, and provider output is validated before it is returned.

The limiter permits 30 authenticated requests per 60-second fixed window by default. State is stored locally in `.context-bridge/api-rate-limit.sqlite` as keyed/hashes only, never raw bearer tokens. It persists across local restarts, uses SQLite WAL mode, and returns `429` plus `Retry-After` when exhausted. To reset only this local limiter state, stop the API and delete that exact SQLite file (and its `-wal`/`-shm` sidecars if present). It is a single-machine limiter, not distributed protection for multiple server instances.

The adapter uses an OpenAI-compatible endpoint. Configure a provider account, quotas, rate limits, and any hosting cost yourself. Never put its key in the CLI, Chrome extension, VS Code extension, or a handoff file. This configuration is not sufficient for public deployment: it lacks multi-user authentication, distributed rate limiting, TLS/reverse-proxy policy, and a browser-safe authorization/pairing flow.

## Google Gemini (optional, explicit live smoke test)

The adapter accepts either Gemini's documented OpenAI-compatible base URL, `https://generativelanguage.googleapis.com/v1beta/openai/`, or the full `/chat/completions` endpoint and normalizes it without appending the path twice. The documented currently configured default is `gemini-3.8-flash`; leave `CONTEXT_BRIDGE_PROVIDER_MODEL` configurable because availability is account-dependent. The adapter requests OpenAI-compatible JSON-object mode, then Context Bridge independently validates the result against its strict handoff schema. JSON mode is not treated as schema conformance.

Set a Gemini key only for the current PowerShell session without echoing it:

```powershell
$secureKey = Read-Host "Enter Gemini API key" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $env:CONTEXT_BRIDGE_PROVIDER_API_KEY =
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secureKey.Dispose()
}
```

Generate the separate local API token if necessary, then run one explicitly requested synthetic smoke call. The environment values apply only to this PowerShell process and its child processes; they are neither printed nor written to a file.

```powershell
if (-not $env:CONTEXT_BRIDGE_API_TOKEN) {
    $bytes = [byte[]]::new(32)
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $env:CONTEXT_BRIDGE_API_TOKEN = [Convert]::ToBase64String($bytes)
}

npm.cmd run smoke --workspace @context-bridge/api
```

`smoke` starts a temporary loopback server with the normal authentication, redaction, request limits, rate limiter, provider adapter, response validation, and artifact generation. It sends one fictional non-private record. Missing provider or local API configuration fails the command before it sends a request; a provider failure reports the local HTTP status, failure category, stage, elapsed time, upstream HTTP status when available, and a bounded redacted diagnostic. It never prints the key, authorization header, or prompt. `CONTEXT_BRIDGE_TIMEOUT_MS` is the route deadline for the provider request (30,000 ms by default); the smoke client adds no shorter outer deadline.

To isolate Gemini connectivity and capacity from the local API route, run `npm.cmd run provider:diagnostic --workspace @context-bridge/api`. It sends one minimal synthetic chat-completions request through the same adapter and reports only elapsed time, provider progress, whether response headers arrived, HTTP status, and a bounded redacted provider diagnostic. It does not require `CONTEXT_BRIDGE_API_TOKEN`. Its independent deadline is 60 seconds by default and can be set for this probe only with `CONTEXT_BRIDGE_PROVIDER_DIAGNOSTIC_TIMEOUT_MS` (1,000–120,000 ms).
