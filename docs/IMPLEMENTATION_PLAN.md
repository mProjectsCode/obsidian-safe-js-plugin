# Safe JS Implementation Plan

## Phase 1: Contracts

- Define the supported code block languages: `safe-js` and `safe-js-debug`.
- Define the worker request, worker response, host RPC request, and host RPC response message schemas.
- Validate every message crossing `postMessage` with a runtime schema.
- Assign every execution a request id, timeout, cancellation path, and cleanup path.

## Phase 2: Worker Runtime

- Create a dedicated worker entry point for user code execution.
- Execute user code without direct access to Obsidian, DOM, Electron, Node.js, or plugin internals.
- Provide a small injected API that can only communicate through the validated RPC bridge.
- Terminate workers on timeout, plugin unload, or explicit cancellation.

## Phase 3: Host RPC Surface

- Start with read-only, low-risk capabilities.
- Require explicit handlers for each RPC method.
- Reject unknown methods, malformed payloads, oversized payloads, and stale request ids.
- Keep RPC responses serializable and free of host object references.

## Phase 4: Rendering

- Register markdown post processors for `safe-js` and `safe-js-debug`.
- Render plain text, markdown, and structured errors through explicit result types.
- Show debug diagnostics only for debug blocks.
- Ensure unload removes processors, workers, and pending requests.

## Phase 5: Verification

- Add unit tests for message schemas and RPC dispatch.
- Add tests for timeout, cancellation, unknown method rejection, and malformed messages.
- Add an example vault note that exercises successful execution, errors, and debug mode.
- Run `bun run check` before release builds.
