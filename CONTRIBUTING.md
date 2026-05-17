# Contributing to Safe JS

Thanks for wanting to contribute to Safe JS. For security-sensitive changes, also read [SECURITY.md](SECURITY.md).

## Development setup

This project uses Bun, Vite, TypeScript, and ESLint. First install the dependencies via `bun install`. Then `bun run dev` builds the development plugin bundle into `exampleVault/.obsidian/plugins/safe-js` and watches for changes.

## Common commands

- `bun run build` builds the production plugin bundle.
- `bun run typecheck` runs TypeScript checks.
- `bun run lint` runs ESLint.
- `bun run test` runs the Bun test suite.
- `bun run check` runs formatting checks, type checks, linting, and tests.
- `bun run check:fix` runs the above while trying to fix formatting and fixable lint errors.

Run `bun run check` before opening a pull request when possible.

## Project conventions

- Follow the Obsidian plugin guidelines and the privacy expectations in [README.md](README.md).
- Register cleanup for DOM, app, and interval listeners with Obsidian's `register*` helpers.
- Prefer `async` and `await` over promise chains.
- Prefer `interface` over `type` and `function` over `const` lambdas where it fits the existing code.

## Pull requests

Good pull requests are small enough to review carefully and include:

- A short explanation of the change.
- Any new permissions, settings, commands, or user-facing behavior.
- Tests for changed behavior.
- Notes about security or privacy impact, especially for RPC, storage, vault, network, or execution changes.
