# ContextLabs

ContextLabs lets you decide, for each document and each section, which files an AI may treat as **sources** (the facts), which are supporting **context** (style, framing, related docs) and which are **excluded**. It also flags sections that have gone **stale** because their sources changed.

It runs as a local MCP server, plus a `docctx` CLI for setup and CI. Your AI client (Claude Code, Claude Desktop, Cursor, VS Code and others) uses the server's tools to load exactly the approved context, write sections and triage stale ones. The server asks you for the decisions that matter: what counts as a source, and whether a section is still correct.

> **Status: early development, not yet published.** Phases 0–2 of the [roadmap](_docs/ROADMAP.md) are done: the file format, scope resolution, section parsing, the local cache and section history all work, and the CLI has `docctx init` and `docctx scope`. The MCP server is next (Phase 3), so AI clients can't use ContextLabs yet, and staleness comes in Phase 4. The design is in [_docs/DESIGN.md](_docs/DESIGN.md) (draft v0.5).

## Why

AI assistants draft technical docs well, but three problems keep coming up:

1. **Scope drift.** The model picks what to read and pulls in unrelated files, roadmap plans or old drafts, so docs describe features that don't exist.
2. **Context bloat.** Pasting whole files or reading broadly wastes tokens and degrades output in long sessions.
3. **Staleness.** Nothing tells you when a doc no longer matches the code it describes.

ContextLabs addresses these with small, committed YAML manifests and deterministic checks. The server never calls an LLM or any network API, so it adds no API cost. All reasoning happens in the AI client you already use.

## How it works

A workspace is any folder with a `.docctx/` directory. Each tracked doc gets a manifest that mirrors its path:

```
my-project/
├── docs/auth/overview.md
├── src/auth/...
└── .docctx/
    ├── workspace.yaml                 # workspace defaults (committed)
    ├── docs/auth/overview.md.yaml     # manifest: scope and verification records (committed)
    ├── docs/auth/overview.md.lock     # source hashes, written by the server (committed)
    ├── cache.json                     # local, disposable (gitignored)
    └── .history/                      # local section history (gitignored)
```

A manifest declares scope for the whole doc and, optionally, per section:

```yaml
doc: docs/auth/overview.md
type: reference
status: review

sources:            # authoritative facts; the doc may only claim what these support
  - src/auth/**
  - specs/auth-v2.md
context:            # style, framing, related docs
  - docs/auth/tokens.md
exclude:
  - plans/**

sections:
  token-refresh:
    sources: [src/auth/refresh.ts]
```

Key properties:

- **Your docs are never touched with metadata.** Everything lives in `.docctx/`. Deleting it leaves the docs exactly as they were, ready to publish with any static site generator.
- **Predictable scope.** Workspace defaults, then doc fields, then section fields, with `exclude` always winning. Every resolved file carries a reason, so you can always see why it is in or out.
- **Sections** are markdown headings plus everything below them, keyed by GitHub-style slugs.
- **Staleness is mechanical.** When a section is verified, the hashes of its sources are recorded in the lock file. If any source changes, is deleted, or the source list itself changes, the section is stale. Git is optional.
- **You decide, the AI operates.** The AI proposes scopes and triages stale sections. The server asks you to approve them through MCP elicitation, or through chat in clients without it (such as Claude Desktop). Every verification records who decided (`human` or `ai`) and how.
- **Shared through git.** Manifests and lock files are committed, so teammates and CI see the same state on a fresh clone.

## Interface

The status columns show what exists today. Everything else is planned.

### MCP tools

| Tool              | Purpose                                                              | Status            |
| ----------------- | -------------------------------------------------------------------- | ----------------- |
| `get_status`      | Workspace summary, or a doc's outline with each section's state      | Next (Phase 3)    |
| `read_section`    | One section's text                                                   | Next (Phase 3)    |
| `get_scope`       | Resolved sources and context for a doc or section, with sizes        | Next (Phase 3)    |
| `set_scope`       | Propose a scope; written only after the user approves                | Phase 3           |
| `write_section`   | Replace one section, saving the previous text to local history first | Phase 3           |
| `mark_no_impact`  | Verify a stale section whose source changes don't affect it          | Phase 4           |
| `confirm_section` | Ask the user to confirm a section or resolve a conflict              | Phase 4           |

MCP prompts (`draft-section`, `revise-section`, `refresh-stale`, `review-doc`, `plan-to-docs`) start common workflows. In Claude Code they appear as slash commands such as `/mcp__contextlabs__draft-section`.

### CLI

| Command                        | Purpose                                                              | Status         |
| ------------------------------ | -------------------------------------------------------------------- | -------------- |
| `docctx init [dir]`            | Create `.docctx/workspace.yaml`, `.gitignore` and `.gitattributes` entries; safe to re-run | Available      |
| `docctx scope <doc> [section]` | Print the resolved scope: every file with the rule that put it in, excluded files and why, and warnings; `--json` for scripts | Available      |
| `docctx serve`                 | Start the MCP server (stdio)                                         | Next (Phase 3) |
| `docctx check`                 | CI check, e.g. `--stale --fail-on published`                         | Phase 4        |
| `docctx move`, `relink`        | Repair manifests after files or headings move                        | Phase 6        |

CLI paths are relative to the current directory. Exit codes: `0` success (warnings included), `1` error, `2` usage error.

Once published, the package will be `contextlabs` on npm: `npx -y contextlabs serve` for MCP clients and `npx contextlabs check ...` in CI.

## Development

Requires Node 22.12+ and npm.

```bash
npm ci
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` compiles `src/` to `dist/`; the binary is `dist/cli/main.js`. To see the explain view, run it against a fixture workspace:

```bash
cd test/fixtures/scope && node ../../../dist/cli/main.js scope docs/guide.md install
```

To run a single test file, pass its path to Vitest:

```bash
npx vitest run test/core/paths/workspace-root.test.ts
```

Layout:

- `src/core/`: the core library (manifests, scope, sections, cache, section history; staleness comes in Phase 4). It must not depend on the CLI, the MCP server or the MCP SDK; lint enforces this.
- `src/cli/`: the `docctx` commands.
- `src/mcp/`: the MCP server.
- `test/`: tests mirroring `src/`, plus fixture workspaces in `test/fixtures/` and golden files for the scope explain view.

All TypeScript follows [_docs/CONV_TYPESCRIPT.md](_docs/CONV_TYPESCRIPT.md). The house style differs from common defaults (tabs, spaces inside parentheses, no ternaries, `m_` prefixed fields), and ESLint enforces most of it; `npm run lint:fix` fixes what it can.

## Documentation

- [DESIGN.md](_docs/DESIGN.md): the specification. It is authoritative.
- [ROADMAP.md](_docs/ROADMAP.md): phases, work items and exit criteria.
- [CONV_TYPESCRIPT.md](_docs/CONV_TYPESCRIPT.md): TypeScript conventions.

## License

[Apache License 2.0](LICENSE)
