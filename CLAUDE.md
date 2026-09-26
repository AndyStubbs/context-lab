# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

ContextLabs has finished Phase 0 (foundations) of [_docs/ROADMAP.md](_docs/ROADMAP.md) and is in Phase 1. The project builds, lints and tests, and contains:

- the path confinement helper (`WorkspaceRoot` in `src/core/paths/`)
- workspace discovery and `workspace.yaml` parsing (`src/core/workspace/`), and manifest parsing (`src/core/manifest/`). Both validate with file:line:column errors (`ManifestError`, `src/core/yaml/`). The manifest writer is next.
- a stub `docctx` CLI
- the fixture workspace at `test/fixtures/basic/`

The spec is [_docs/DESIGN.md](_docs/DESIGN.md) (draft v0.5), and it is authoritative. Read the relevant section before implementing anything.

## Commands

Node 22.12+ and npm.

```bash
npm ci                 # install
npm run typecheck      # tsc --noEmit over src, test and configs
npm run lint           # ESLint, which also enforces the house style; lint:fix autofixes
npm test               # Vitest, all tests
npm run build          # compile src/ to dist/ (bin: dist/cli/main.js)
npx vitest run test/core/paths/workspace-root.test.ts            # one file
npx vitest run test/core/paths/workspace-root.test.ts -t symlink # tests whose name matches
```

Layout:

- `src/core/` is the core library. ESLint fails if it imports `cli/`, `mcp/`, the MCP SDK or `commander`.
- `src/cli/` holds the `docctx` commands.
- `src/mcp/` holds the MCP server. `no-console` is on there, except for `console.error` and `console.warn`.
- Tests live in `test/`, mirroring `src/`. Fixture workspaces are in `test/fixtures/`, which typecheck and lint skip.
- Every path from a manifest, tool argument or CLI argument goes through `WorkspaceRoot.resolve()`. Only its `absolute` result is passed to `fs`. Its `relative` result (forward slashes) is the path's identity.

Follow [_docs/CONV_TYPESCRIPT.md](_docs/CONV_TYPESCRIPT.md) for all TypeScript. Its house style differs from common defaults: tabs, required semicolons, spaces inside parentheses (`if( x )`, `call( a, b )`), double quotes only, no ternaries, `m_` prefix on instance fields, and snake_case wire names for manifest, lock file and cache fields. Two rules are easy to miss: never write to stdout in the MCP server (it carries JSON-RPC), and use the `yaml` `Document` API when writing manifests back.

## Workflow

Solo project; this is an honor system, with no branch protection on `main`.

- **Code changes** go on a short-lived branch named for the work item (`phase1/manifest-parsing`), then through a PR that is squash-merged once CI is green. Delete the branch after merging. Tick the ROADMAP checkbox in the same PR.
- **Doc-only changes** (`_docs/**`, `README.md`, `CLAUDE.md`, `LICENSE`) are committed directly to `main`. CI skips them through `paths-ignore` in `.github/workflows/ci.yml`; keep that list and this one in sync. Never add `**.md` to it: the fixtures in `test/fixtures/` are Markdown and must run CI.
- CI (`.github/workflows/ci.yml`) runs install, typecheck, lint, test and build on Linux, macOS and Windows, with Node 22 and 24. Run the same steps locally before opening a PR.

## What it is

A local-first MCP server (plus a `docctx` CLI) that lets users explicitly declare, per document and per section, which files are authoritative **sources**, which are supporting **context**, and which are **excluded** when an AI drafts or revises docs. The MCP server is the main interface: the AI operates through its tools, and the server asks the user for decisions through MCP elicitation. It flags sections that have gone stale because their sources changed, and it commits verification records and source hashes so CI and teammates see them.

## Architecture (DESIGN.md §6)

Layered. Everything except the file format is an adapter over the core:

1. **File format** (the real product): `.docctx/workspace.yaml`, plus one YAML manifest and one lock file per tracked doc. Each manifest mirrors the doc's path and keeps its extension, so `docs/auth/overview.md` maps to `.docctx/docs/auth/overview.md.yaml`, with its lock file at `.docctx/docs/auth/overview.md.lock`. Manifests hold scope and verification records (when, who, why); lock files hold the source hashes. Both are committed.
2. **Core library**: manifest and lock file reading and writing, scope resolution, section parsing, staleness, the local cache. It must not depend on MCP.
3. **MCP server** (main interface): stdio; seven tools (`get_status`, `read_section`, `get_scope`, `set_scope`, `write_section`, `mark_no_impact`, `confirm_section`), elicitation for user decisions, prompts, and an `instructions` field describing the operating model (§14). No resources in v1.
4. **CLI** (`docctx`): `serve` starts the MCP server; the rest covers what MCP can't do: `init`, `scope`, `check` (CI), `hook`, `move`, `relink`.
5. **Claude Code plugin** (later): skill and the post-edit staleness hook. Slash commands come from the MCP prompts (`/mcp__contextlabs__draft-section`). The scope-warning hook is deferred past v1.

Stack (§20): **TypeScript on Node 22+ is decided**; C# and Python were considered and rejected. Libraries: the official MCP TypeScript SDK, `yaml` (chosen because it preserves comments when rewriting manifests), `remark`/`mdast`, `fast-glob` (expansion) and `picomatch` (matching), `commander` for the CLI, and Vitest for tests. No database: SQLite was dropped in v0.4 (§12). Distribution: one npm package, `contextlabs`, with a single `docctx` binary (`npx -y contextlabs serve` for MCP, `npx contextlabs check ...` in CI).

## Invariants that span the codebase

- **The server never calls an LLM or any network API.** All logic is deterministic. MCP sampling is not used in v1.
- **Tracked docs are never modified with metadata.** Metadata lives only in `.docctx/`. Deleting `.docctx/` must leave the docs untouched.
- **Committed YAML is the source of truth (§12).** The only local files are `.docctx/cache.json` and `.docctx/.history/`, both gitignored. The cache must be safe to delete at any time: missing, stale or corrupt means rebuild, never a different result. `.history/` holds previous section content saved by `write_section`, as a local safety net only. Staleness must work on a fresh clone from committed files alone.
- **Scope resolution order (§9):** workspace defaults → doc fields (lists merge, scalars override, `{ replace: [...] }` replaces) → section fields (section `sources` *replace* doc sources) → apply `exclude` last (exclude always wins) → drop docs excluded by type/status rules (e.g. superseded plans) → expand globs, dedupe, sort. Every resolved entry carries a `reason` string for the explain view.
- **Sections (§10):** a heading plus everything below it until the next heading of the same or higher level. Keys are GitHub-style slugs; duplicate slugs are disambiguated by parent path (`setup/install`). Unmatched manifest section keys are reported as **orphaned** and never silently dropped. Non-markdown docs are a single unit with no sections.
- **Staleness (§13):** a section is stale when any source hash recorded at verification has changed, a source was deleted, or the resolved source list itself changed. A section that was never verified is **unverified**, not stale. Use mtime and size as a pre-check before rehashing. Every verification records `verified.by` (`human` or `ai`) in the manifest, plus `via` (`elicitation` or `chat`) for human decisions; the lock file holds the source hashes with a matching `at`. Any disagreement between the two resolves to stale or unverified, never verified. The AI triages stale sections, but it may self-verify (`mark_no_impact`) only changes it judges to have no impact. Conflicts go to the user through `confirm_section`, and a section stays stale until someone verifies it. `write_section` never verifies.
- **Operating model (§5):** the user decides (approves scopes, resolves conflicts); the AI operates through MCP tools. The server, not the AI, writes manifests and lock files, and only after the user approves (via elicitation, or chat as a fallback). With elicitation available, tools must reject a chat-supplied `user_decision`. Claude Desktop has no elicitation, so the chat fallback is a main path, not an edge case. Manifests are storage, not the UI, so they must stay hand-editable and diff-friendly.
- **Safety (§18):** all paths are relative to the workspace root, and anything resolving outside it (including via symlinks) is rejected. `write_section` is the only server path that writes a tracked doc; it replaces one section's line range and saves the previous content to `.docctx/.history/` first. Move/relink operations never run automatically.
- **Keep the MCP surface small:** tool descriptions stay at one or two sentences, outputs stay compact, and responses return slices (outlines or single sections) rather than whole files. `get_scope` never truncates: above `max_context_bytes` it returns paths and sizes only. The `instructions` field stays under 2 KB (Claude Code's cap). Tools are how the AI operates; decisions go to the user through elicitation; prompts start user workflows.

## Milestones (§21)

[_docs/ROADMAP.md](_docs/ROADMAP.md) breaks these into Phases 0–9, each with work items, decisions to make and an exit criterion. Tick its checkboxes as work lands. In summary, build in order: M1 core (parsing and manifest writing, scope and explain view, sections, local cache and section history, `get_status`/`read_section`/`get_scope`/`set_scope`/`write_section` with elicitation, `draft-section`/`revise-section` prompts, and CLI `serve`/`init`/`scope`) → M2 staleness with verification records and lock files, `mark_no_impact`/`confirm_section`, CI `check` → **dogfooding checkpoint** (after staleness, deliberately) → orphans/move/relink → M3 plan lifecycle and banned terms → M4 Claude Code plugin. Open design questions are listed in §23. Raise them rather than silently deciding them.
