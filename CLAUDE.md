# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

ContextLabs has finished Phase 0 (foundations), Phase 1 (file format and scope) and Phase 2 (cache and section history) of [_docs/ROADMAP.md](_docs/ROADMAP.md), and is partway through Phase 3 (MCP server), which lands as the five PRs in its delivery plan. The project builds, lints and tests, and contains:

- the path confinement helper (`WorkspaceRoot` in `src/core/paths/`)
- workspace discovery and `workspace.yaml` parsing (`src/core/workspace/`), and manifest parsing (`src/core/manifest/`). Both validate with file:line:column errors (`ManifestError`, `src/core/yaml/`).
- the manifest writer (`prepareScopeChange` / `writeManifestUpdate` over `ManifestEditor` in `src/core/manifest/`): it computes and validates a scope change without writing it, so `set_scope` can ask for approval first, then writes atomically and refuses if the file changed in between
- section outlines and keys (`src/core/sections/`): heading tree with line ranges, §10 slugs and disambiguation, orphaned manifest keys
- scope resolution (`src/core/scope/`): the §9 merge with a reason per file, excluded files and why, type rules via `listManifests`, size budget; `loadScope` is the entry point, and `previewScopeChange` resolves a proposed change without writing it
- the disposable cache (`WorkspaceCache` in `src/core/cache/`): file fingerprints with the §13 pre-check; loads empty when missing, corrupt or stale, and a failed save never fails a command
- section history (`SectionHistory` in `src/core/history/`): numbered versions under `.docctx/.history/`, saved only by `write_section`
- doc and workspace status (`loadDocStatus`, `loadWorkspaceStatus` in `src/core/status/`) and section text (`loadSection` in `src/core/sections/`), which the read tools wrap. `writeSection` (same folder) is the only code that writes a tracked doc: it checks the `sectionHash` the caller read, keeps the section's shape, refuses to orphan manifest keys, and saves history before writing.
- the MCP server (`src/mcp/`): `createServer` registers the tools `get_status`, `read_section`, `get_scope`, `set_scope` and `write_section`, and the prompts `draft-section` and `revise-section` (built from `loadDraftContext` in `src/core/scope/`, with `doc` and `section` completion), and `serveStdio` runs it. `set_scope` asks the user through elicitation when the client supports it, and otherwise returns a preview and a `preview_token` for a second call with `user_decision` (DESIGN.md §14.2). Tool and prompt bodies go through `runTool` and `runPrompt` (over `runInWorkspace`), which find the workspace on each call and turn expected core errors into `isError` results or `InvalidParams` errors. Output follows ROADMAP.md Phase 3's settled decisions: compact `snake_case` JSON for metadata, and plain-text blocks for file contents.
- the `docctx` CLI with `init`, `scope` and `serve` (`src/cli/`); `runCli` returns the exit code so tests run commands in-process
- fixture workspaces at `test/fixtures/basic/` and `test/fixtures/scope/`, with golden files in `test/core/scope/__golden__/` (JSON) and `test/cli/__golden__/` (the explain view). After an intended output change, regenerate them with `npx vitest run -u` and review the diff.

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
node dist/cli/main.js init [dir]                  # set up a workspace; safe to re-run
node dist/cli/main.js scope <doc> [section]       # explain a scope; --json for the raw result
node dist/cli/main.js serve [--workspace <dir>]   # MCP over stdio; DOCCTX_WORKSPACE also sets the workspace
                                                  # --approvals chat (or DOCCTX_APPROVALS) forces chat approvals
```

CLI exit codes: `0` success (warnings included), `1` error (untracked doc, unknown section, invalid manifest, path outside the workspace, no workspace found), `2` usage error. Paths on the command line are relative to the current directory.

Layout:

- `src/core/` is the core library. ESLint fails if it imports `cli/`, `mcp/`, the MCP SDK or `commander`.
- `src/cli/` holds the `docctx` commands.
- `src/mcp/` holds the MCP server. `no-console` is on there, except for `console.error` and `console.warn`.
- Tests live in `test/`, mirroring `src/`. Fixture workspaces are in `test/fixtures/`, which typecheck and lint skip. `copyFixture` (`test/helpers/scratch-fixture.ts`) gives a test a scratch copy to break, and `connectClient` (`test/helpers/mcp-client.ts`) connects an SDK client over an in-memory transport, answering elicitation requests when given a handler. `test/mcp/serve-stdio.test.ts` builds `dist/` itself and runs the real binary.
- Every path from a manifest, tool argument or CLI argument goes through `WorkspaceRoot.resolve()`. Only its `absolute` result is passed to `fs`. Its `relative` result (forward slashes) is the path's identity.

Follow [_docs/CONV_TYPESCRIPT.md](_docs/CONV_TYPESCRIPT.md) for all TypeScript. Its house style differs from common defaults: tabs, required semicolons, spaces inside parentheses (`if( x )`, `call( a, b )`), double quotes only, no ternaries, `m_` prefix on instance fields, and snake_case wire names for manifest, lock file and cache fields. Two rules are easy to miss: never write to stdout in the MCP server (it carries JSON-RPC), and use the `yaml` `Document` API when writing manifests back.

## Workflow

Solo project; this is an honor system, with no branch protection on `main`.

- **Code changes** go on a short-lived branch named for the work item (`phase1/manifest-parsing`), then through a PR that is squash-merged once CI is green. Delete the branch after merging. Tick the ROADMAP checkbox in the same PR.
- **Doc-only changes** (`_docs/**`, `README.md`, `CLAUDE.md`, `LICENSE`) are committed directly to `main`. CI skips them through `paths-ignore` in `.github/workflows/ci.yml`; keep that list and this one in sync. Never add `**.md` to it: the fixtures in `test/fixtures/` are Markdown and must run CI.
- CI (`.github/workflows/ci.yml`) runs install, typecheck, lint, test and build on Linux, macOS and Windows, with Node 22 and 24. Run the same steps locally before opening a PR.
- Changes to the MCP surface also get the manual client checks in [_docs/MANUAL_CHECKS.md](_docs/MANUAL_CHECKS.md) at the end of the phase; tool-definition size is checked against the baseline in ROADMAP.md Phase 3.

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
- **Staleness (§13):** a section is stale when any source hash recorded at verification has changed, a source was deleted, or the resolved source list itself changed. A section that was never verified is **unverified**, not stale. Use the stat pre-check in `WorkspaceCache.hashFile` (size, mtime, ctime, inode, and a 2 s racy window) before rehashing. Every verification records `verified.by` (`human` or `ai`) in the manifest, plus `via` (`elicitation` or `chat`) for human decisions; the lock file holds the source hashes with a matching `at`. Any disagreement between the two resolves to stale or unverified, never verified. The AI triages stale sections, but it may self-verify (`mark_no_impact`) only changes it judges to have no impact. Conflicts go to the user through `confirm_section`, and a section stays stale until someone verifies it. `write_section` never verifies.
- **Operating model (§5):** the user decides (approves scopes, resolves conflicts); the AI operates through MCP tools. The server, not the AI, writes manifests and lock files, and only after the user approves (via elicitation, or chat as a fallback). With elicitation available, tools must reject a chat-supplied `user_decision`, unless the user started the server with `--approvals chat` for a client that advertises elicitation but never shows it (Claude Code in print mode, as in the desktop app's Code tab). Claude Desktop has no elicitation, so the chat fallback is a main path, not an edge case. Manifests are storage, not the UI, so they must stay hand-editable and diff-friendly.
- **Safety (§18):** all paths are relative to the workspace root, and anything resolving outside it (including via symlinks) is rejected. `write_section` is the only server path that writes a tracked doc; it replaces one section's line range and saves the previous content to `.docctx/.history/` first. Move/relink operations never run automatically.
- **Keep the MCP surface small:** tool descriptions stay at one or two sentences, outputs stay compact, and responses return slices (outlines or single sections) rather than whole files. `get_scope` never truncates: above `max_context_bytes` it returns paths and sizes only. The `instructions` field stays under 2 KB (Claude Code's cap). Tools are how the AI operates; decisions go to the user through elicitation; prompts start user workflows.

## Milestones (§21)

[_docs/ROADMAP.md](_docs/ROADMAP.md) breaks these into Phases 0–9, each with work items, decisions to make and an exit criterion. Tick its checkboxes as work lands. In summary, build in order: M1 core (parsing and manifest writing, scope and explain view, sections, local cache and section history, `get_status`/`read_section`/`get_scope`/`set_scope`/`write_section` with elicitation, `draft-section`/`revise-section` prompts, and CLI `serve`/`init`/`scope`) → M2 staleness with verification records and lock files, `mark_no_impact`/`confirm_section`, CI `check` → **dogfooding checkpoint** (after staleness, deliberately) → orphans/move/relink → M3 plan lifecycle and banned terms → M4 Claude Code plugin. Open design questions are listed in §23. Raise them rather than silently deciding them.
