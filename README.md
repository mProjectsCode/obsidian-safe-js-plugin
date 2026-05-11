# Obsidian Safe JS Plugin

Safe JS is an Obsidian plugin for running note-owned JavaScript with a deliberately small host API.
The planned execution model is sandboxing inside Web Workers plus a constrained RPC layer over `postMessage`.

## Current Status

This repository is prepared for planning and implementation.
The plugin metadata, package name, lint paths, and development vault paths use the `safe-js` plugin id.
The Obsidian entry point is still intentionally minimal while the sandbox and RPC contracts are designed.

## Design Goals

- Execute user scripts away from the Obsidian UI thread.
- Expose only explicit host capabilities through validated RPC messages.
- Keep worker lifetime, cancellation, timeout, and cleanup behavior predictable.
- Make the supported API small enough to audit and document.
- Prefer structured data contracts over stringly typed host calls.

## Non-Goals

- Full Node.js, Electron, DOM, or Obsidian API access inside user scripts.
- Compatibility with unrestricted script runner plugins.
- Implicit access to vault files, network, shell commands, or global app state.

## Planned Code Block Languages

- `safe-js` for normal execution.
- `safe-js-debug` for debug rendering and execution diagnostics.

## Implementation Plan

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
