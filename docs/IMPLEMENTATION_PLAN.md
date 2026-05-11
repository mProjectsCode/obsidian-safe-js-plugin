# Safe JS Implementation Notes

## Execution Service

- `SafeJsExecutionService` owns code hashing, permission parsing, approval lookup, prompting, worker execution, timeout cleanup, and RPC dispatch.
- The plugin exposes the service instance as `plugin.api` so other plugins can call `execute(code, options)` without reaching into markdown rendering or settings.
- Dependencies are injected: RPC registry, approval store, prompt adapter, worker factory, clock/hash/timer helpers, and timeout provider.

## Permissions

- Scripts declare permissions with contiguous leading comments such as `// @permission vault:read`.
- Permission approvals are stored in `localStorage` through `LocalStoragePermissionApprovalStore`, keyed by the hash of the full source code.
- Plugin settings do not store approvals.
- Unknown, malformed, duplicate, or non-leading permission declarations fail before worker creation.

## RPC and Worker Runtime

- Host and worker messages are validated with zod contracts before handling.
- RPC methods live in `RpcRegistry`; handlers declare request/response schemas, required permission, and worker API binding metadata.
- v1 vault methods are read-only: `vault:read`, `vault:list`, and `vault:stat`, all gated by `vault:read`.
- Worker code receives an injected `api` object, for example `await api.vault.read("Daily.md")`.
- Workers are terminated after success, error, timeout, plugin unload, or explicit cancellation.

## Rendering and Verification

- Markdown processors are registered for `safe-js` and `safe-js-debug`; debug blocks include status, hash, permissions, elapsed time, and value/error details.
- Tests use `bun test` and cover permission parsing/storage, RPC dispatch failures, approval prompting, stored approvals, injected worker execution, parse failures, and timeout termination.
