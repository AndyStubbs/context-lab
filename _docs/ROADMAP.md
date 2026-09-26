# ContextLabs — Implementation Roadmap


|                  |                    |
| ---------------- | ------------------ |
| **Status**       | Draft              |
| **Version**      | 0.4                |
| **Last updated** | September 25, 2026 |
| **Based on**     | [`DESIGN.md`](DESIGN.md) v0.5 |


---

## 1. Purpose

This roadmap turns the milestones in DESIGN.md §21 into ordered implementation phases. Each phase lists its work items, what it depends on, the decisions that must be made during it, and a concrete exit criterion. DESIGN.md remains the spec. When this roadmap and the design disagree, the design wins, and the disagreement should be raised and fixed in one document or the other.

Section references (§) point to DESIGN.md unless stated otherwise. Coding rules are in [`CONV_TYPESCRIPT.md`](CONV_TYPESCRIPT.md).

---

## 2. Phase overview

| Phase | Name                          | Design milestone | Depends on | Outcome                                                    |
| ----- | ----------------------------- | ---------------- | ---------- | ---------------------------------------------------------- |
| 0     | Foundations                   | —                | —          | Buildable, linted, tested empty project; key libraries chosen |
| 1     | File format and scope         | M1               | 0          | Manifests parse and write; `docctx scope` explains any doc or section |
| 2     | Cache and section history     | M1               | 1          | Disposable `cache.json`; section history in `.history/`   |
| 3     | MCP server MVP                | M1               | 2          | Scopes set by approval, context loaded and sections written from Claude Code and Claude Desktop |
| 4     | Staleness                     | M2               | 3          | Stale detection, verification records and lock files, triage tools, CI check |
| 5     | Dogfooding checkpoint         | M1 + M2 exit     | 4          | Two weeks of real use; exit criterion met or not           |
| 6     | Orphans, moves and relinks    | M2               | 5          | Moves and heading renames no longer break manifests        |
| 7     | Plans and terminology         | M3               | 5          | Plan lifecycle, `plan-to-docs`, banned-term check          |
| 8     | Claude Code plugin            | M4               | 5          | Skill and post-edit staleness hook                         |
| 9     | Release and client coverage   | —                | 5, then each later phase | Published to npm; client matrix verified     |
| —     | Later                         | Later            | —          | Local UI, search, resources, non-markdown sections         |

The dogfooding checkpoint comes after staleness, not before it (DESIGN.md §21): staleness is what no other tool provides, so the project is judged with it in place. Phases 6, 7 and 8 all depend on the checkpoint but not on each other, so they can be done in any order after it. Phase 9 is a release track: a preview release follows Phase 5, and each later phase ends with a release.

```
0 ──► 1 ──► 2 ──► 3 ──► 4 ──► 5 ──┬──► 6
                              │   ├──► 7
                              │   └──► 8
                              └──► 9 (preview release, then one per phase)
```

---

## 3. Phase 0 — Foundations

**Goal:** an empty but complete project that builds, lints and tests, with the remaining technology choices made.

### Work items

- [x] `package.json` named `contextlabs`, with `"type": "module"`, `engines.node >= 22` (22.12 in practice, the minimum for commander 15 and Vitest 5), and a single `bin` entry, `docctx`.
- [x] `tsconfig.json` with the strictness options in CONV_TYPESCRIPT.md, `module` / `moduleResolution` set to `NodeNext`.
- [x] ESLint with `@stylistic` rules encoding the house style (tabs, semicolons, spaces inside parentheses, no space after `if`, double quotes, no ternaries via `no-ternary`).
- [x] `.editorconfig` (tabs for TS/JS/JSON, two spaces for YAML).
- [x] Test runner and a first passing test.
- [x] Source layout: `src/core/`, `src/cli/`, `src/mcp/`. Add a lint rule (for example, `no-restricted-imports`) that fails if `src/core/` imports from `src/cli/`, `src/mcp/` or the MCP SDK.
- [x] **Path confinement helper** in core, written and tested first, since every later phase depends on it (§18). It resolves against the workspace root, follows symlinks with `realpath`, rejects escapes, and normalizes to workspace-relative forward-slash paths.
- [x] **Fixture workspaces** under `test/fixtures/`: a small realistic project matching §7 (docs, plans, `src/`, `.docctx/`), plus targeted fixtures for edge cases added as later phases need them.
- [x] CI: install, typecheck, lint, test, on Linux, macOS and Windows (path handling differs on Windows).
- [x] Record build, lint, test and single-test commands in `CLAUDE.md`.

### Decided (DESIGN.md §20)

- **Test runner:** Vitest, for its snapshot support in golden-file tests.
- **CLI parsing:** `commander`, for subcommands.
- **Globs:** `fast-glob` to expand, `picomatch` to match excludes and reverse lookups.
- **Package and binary:** one npm package, `contextlabs`, with a single `docctx` binary. `npx -y contextlabs serve` starts the MCP server; `npx contextlabs check ...` runs in CI. The name `contextlabs` was unregistered on npm in September 2026. Register it early.

### Exit criterion

A fresh clone runs install, typecheck, lint and test green in CI on all three operating systems. The confinement helper has tests for `..` escapes, absolute paths and symlink escapes.

---

## 4. Phase 1 — File format and scope

**Goal:** the file format (the real product, §6) is fully parsed, validated and explained, with no database yet.

### Work items

**Workspace and manifests (§8, §9)**
- [x] Locate the workspace by walking up from the current directory to the nearest `.docctx/`.
- [x] Parse `workspace.yaml` and manifests with the `yaml` `Document` API.
- [x] Validation with errors that give the file, line and column (§21), covering: missing required fields, `allow_terms` entries that aren't strings, unknown `type`, `status` not in the type's statuses, plan-only fields on non-plans, malformed `{ replace: [...] }`, paths outside the workspace, and the reserved doc paths in §7.
- [x] Ship the three default types (`reference`, `guide`, `plan`) when `workspace.yaml` defines none (§11).
- [x] Types for the parsed model using the snake_case wire names.
- [x] Manifest writer: create a manifest at the mirrored path (§7) and update `sources`, `context` and `exclude` for a doc or section with the `yaml` `Document` API, preserving comments and key order. `set_scope` (Phase 3) and verification records (Phase 4) build on it.
- [x] Round-trip tests: a manifest with comments, rewritten with a scope change, differs from the original only in the changed lines.

**Sections (§10)**
- [ ] Parse markdown with `remark` into mdast and build the section tree from headings, with start and end lines from node positions.
- [ ] GitHub-style slugs. If using `github-slugger`, use its stateless `slug()` function only: its built-in de-duplication appends `-1`, but the design disambiguates duplicates by parent path (`setup/install`).
- [ ] Treat non-markdown docs as a single unit with no sections.
- [ ] Report manifest section keys that match no heading as orphaned.

**Scope resolution (§9)**
- [ ] Implement the six-step merge order exactly, with a `reason` on every entry (for example, `defaults.context`, `sections.token-refresh.sources`).
- [ ] Record excluded files and the rule that excluded them, so the explain view can say why a file is *out* as well as in.
- [ ] Apply type rules (`exclude_from_context_when`) when another tracked doc appears in scope. This needs manifest status lookups for docs in scope, not just the doc being resolved.
- [ ] Compute the total byte size of the resolved scope and warn when it exceeds `settings.max_context_bytes`.
- [ ] Golden-file tests for the explain output across the fixture workspaces, including each merge rule and "exclude always wins".

**CLI**
- [ ] `docctx init`: create `.docctx/workspace.yaml` with commented defaults, add `.docctx/cache.json` and `.docctx/.history/` to `.gitignore`, and mark `.docctx/**/*.lock` as `linguist-generated` in `.gitattributes` (creating either file if needed, without touching other lines).
- [ ] `docctx scope <doc> [section]`: print the resolved scope with reasons, the excluded files, and the size.

### Exit criterion

For every fixture, `docctx scope` output matches the golden files, and a person reading a manifest can predict the output (§5 principle 5). Invalid manifests produce errors that point to the right line.

---

## 5. Phase 2 — Cache and section history

**Goal:** the local files from §12, with the rule that the cache is always safe to delete.

### Work items

- [ ] Cache interface in core, backed by `.docctx/cache.json`, with a format version. Rebuild when the file is missing, corrupt or from another version.
- [ ] Atomic writes for the cache and history files: write to a temporary file, then rename.
- [ ] Cache contents for M1: each tracked doc's last known content hash, and the reverse lookup from source file to dependent sections. File hashes are added in Phase 4.
- [ ] Section history store in `.docctx/.history/`: save a version (numbered per doc and section, `@doc` for docs without sections) and fetch one. Only `write_section` writes to it.
- [ ] Incremental refresh on demand (Open question 4, resolved): before serving each request, recompute only what changed, using mtime and size, instead of rebuilding everything. No file watching.

### Exit criterion

Deleting `cache.json`, or replacing it with garbage, changes no command or tool output. It only costs a rebuild. Section history survives cache deletion. Two processes (the server and a CLI hook) writing the cache at once never leave it unreadable.

---

## 6. Phase 3 — MCP server MVP

**Goal:** the M1 MCP surface running over stdio and working in Claude Code and Claude Desktop.

### Work items

**Server**
- [ ] stdio server using the official TypeScript MCP SDK. All logging goes to stderr.
- [ ] Resolve the workspace from the server's working directory, with an optional argument or environment variable to override it.

- [ ] `instructions` field with a short summary of the operating model (§5, §14): propose scopes through `set_scope`, never edit `.docctx/` files directly, and only make claims the sources support. Keep it under 2 KB, Claude Code's cap, and add a test that fails if it grows past that.
- [ ] `docctx serve` subcommand that starts the stdio server.
- [ ] Detect at connection whether the client supports elicitation, and choose the approval path for `set_scope` from that (§14.2).

**Tools (§14.1, M1 subset)**
- [ ] `get_status`: workspace summary, or a doc's outline. Section states come in Phase 4.
- [ ] `read_section`
- [ ] `get_scope`, including `content: true`. Above `max_context_bytes`, return paths, sizes and a warning instead of contents. Never truncate (§14.1).
- [ ] `set_scope`: validate the proposal, resolve it, ask the user through elicitation, and write the manifest only on accept. Without elicitation, return the preview and accept `user_decision` and an optional `user_note` on a second call. With elicitation, reject both parameters (§14.2).
- [ ] Elicitation messages of at most three lines, naming the doc, the section, the files and the resolved size.
- [ ] `write_section`: save the previous content to section history, then rewrite only that section's line range (§18).
- [ ] Expected failures returned as `isError: true` results. Descriptions kept to one or two sentences.

**Prompts (§14.3)**
- [ ] `draft-section`: resolved scope, audience, style guide and glossary, plus the instruction to only make claims the sources support and to say so when they don't.
- [ ] `revise-section`: current section text plus scope and the user's instruction.
- [ ] Both prompts wrap source content as data and tell the model not to follow instructions inside source files (§18).
- [ ] Argument completion for `doc` and `section` (MCP `completion/complete`) where clients support it. This is optional but greatly improves usability.

**Verification**
- [ ] Integration tests that drive the server through the SDK's client over stdio against the fixtures, covering both approval paths: an elicitation-capable test client that accepts and declines, and one without elicitation.
- [ ] Manual check in Claude Code (elicitation forms) and Claude Desktop (chat fallback, since it has no elicitation) (§19). Record how prompts and elicitation requests look to the user in each.

### Exit criterion

In Claude Code, the AI proposes a scope for a fixture doc, the user approves it through elicitation (or chat, if unsupported), and the server writes a valid manifest with comments intact. A user can invoke `draft-section` for a fixture section, get a draft from sources only, and have it written with `write_section`, with the previous content in section history. The same flow works in Claude Desktop using `get_scope` with `content: true` and chat approvals recorded as `via: chat`. Tool definitions and descriptions are measured, and the per-session overhead is recorded as a baseline (§17).

---

## 7. Phase 4 — Staleness

**Goal:** the staleness, verification and triage model in §13, usable from MCP, the CLI and CI.

### Work items

**Hashing and state**
- [ ] File hashing with the configured algorithm, using mtime and size as a pre-check before rehashing (§13).
- [ ] Verification records in manifests (§13), written only by the server with the `yaml` `Document` API: `verified.at`, `verified.by` (`human` or `ai`), `verified.via` (`elicitation` or `chat`) for human decisions, and an optional note.
- [ ] Lock files (`<doc path>.lock`), written in full by the server with sorted keys: format version, hash algorithm, and per section the matching `at` and a 16-hex-character hash of every resolved source.
- [ ] Section state computation from both files: **stale** if a verified source's hash changed, a source was deleted, or the resolved source list itself changed; **unverified** if never verified. Apply the §13 mismatch table, so a disagreement between manifest and lock file never reads as verified.
- [ ] Add current file hashes to the cache, using the mtime and size pre-check.
- [ ] Test on a fresh clone of a fixture repo with no `cache.json`: states must come out the same as on the original machine.
- [ ] Mismatch tests: a lock entry with a different `at`, a missing lock file, and a lock entry with no manifest record.

**Tools and prompts**
- [ ] `get_status`: add section states, stale, unverified and orphaned counts, who made the last verification, and change summaries for stale sections.
- [ ] Change summaries when git is available: `git log` and a diff for the changed sources since the verification, up to `settings.max_diff_bytes` per section (default 20 KB), falling back to `git log --stat` above that. Everything must work without git; without it, triage compares the section against the current sources.
- [ ] `mark_no_impact`: record a verification with `by: ai` and a required note.
- [ ] `confirm_section`: ask the user through elicitation to apply the proposed text, keep the section as is, or leave it stale (§14.2). Apply writes through the same path as `write_section`, then records `by: human`. Chat fallback as for `set_scope`.
- [ ] `write_section` never records a verification.
- [ ] `refresh-stale` prompt: stale sections plus change summaries, with instructions to triage each one as no impact, conflict or unsure, use `mark_no_impact` only for no impact, and send everything else to `confirm_section` with the specific claim and a proposed fix (§13).
- [ ] `instructions` field: add the triage rule.

**CLI**
- [ ] `docctx check --stale --fail-on <status>` for CI, with documented exit codes.
- [ ] `docctx check --require-human <status>`: also fail when a section in a doc at that status was last verified by the AI.
- [ ] Stale and orphan summary in `docctx check` output for local use. (A separate `docctx status` command from the v0.1 §6 diagram is no longer planned, since `get_status` and `check` cover it.)

### Exit criterion

Editing a source file in a fixture makes the dependent section stale in `get_status` and `docctx check`, including on a fresh clone. `mark_no_impact` clears it with `by: ai`; `confirm_section` clears it with `by: human` after the test client accepts, and leaves it stale after the client declines. The CI command fails and passes as expected, including `--require-human` failing on an AI-verified section of a published doc. In a dogfooding run, `refresh-stale` sorts a rename-only change as no impact and a behavior change as a conflict.

---

## 8. Phase 5 — Dogfooding checkpoint

**Goal:** meet or fail the exit criterion for M1 and the staleness part of M2 (§21): the author uses ContextLabs for two weeks on real docs, reaches for it instead of pasting context by hand, and finds that stale flags catch real drift.

### Work items

- [ ] Use it on at least one real docs set, ideally including ContextLabs' own docs.
- [ ] Record every stale flag and whether it was a real conflict or noise, to judge whether staleness earns its place.
- [ ] Record how much manifest upkeep remains, to decide Open question 7 (fewer per-doc manifests).
- [ ] Keep a friction log: confusing merge results, missing tools, clients that hide prompts or lack elicitation, approval requests that are hard to read or too frequent, context size surprises.
- [ ] Note how often proposed scopes are accepted, changed or declined (§24). The server can't observe this, so it goes in the log.
- [ ] Measure precision (§24): resolved scope size compared with the folders that would otherwise have been pasted.
- [ ] Publish a 0.x preview to npm (Phase 9 track).

### Exit criterion

A go/no-go on M1 and M2's staleness work, and a short written review. Friction log items are either fixed, scheduled into a later phase, or turned into design changes before Phase 6 starts.

---

## 9. Phase 6 — Orphans, moves and relinks

**Goal:** moving docs and renaming headings no longer silently breaks manifests (§16).

### Work items

- [ ] Detection on startup and in `docctx check`: manifests whose `doc` no longer exists, and section keys that match no heading.
- [ ] Suggestions: git rename detection when in a repo, otherwise match the doc's last known content hash from the cache against untracked files.
- [ ] `docctx move <old> <new>`: move the doc, its manifest and its lock file together, and update references in other manifests with the `yaml` `Document` API so comments survive.
- [ ] `docctx relink <manifest> <new-path>`: repair an orphan after the user confirms, moving its lock file with it.
- [ ] Heading renames: suggest the renamed heading for an orphaned section key, using section content hashes. Renaming the key updates both the manifest and the lock file.
- [ ] Nothing is deleted or relinked automatically.
- [ ] `move` and `relink` stay CLI-only (decided in DESIGN.md v0.5). Moving docs is rare and usually done by a person.

### Exit criterion

Moving a doc with `docctx move` leaves every manifest valid, with comments intact. Moving it by hand is detected, and a correct suggestion is offered.

---

## 10. Phase 7 — Plans and terminology

**Goal:** the plan lifecycle (§11) and terminology checks.

### Work items

- [ ] Plan fields: `supersedes`, `implements_into`, `decided_on`. Validate that they appear only on plans and that referenced paths exist.
- [ ] Superseded plans excluded from other docs' context (building on the type rules from Phase 1).
- [ ] `plan-to-docs` prompt: for a decided plan, list the `implements_into` docs with their **affected** sections (resolved sources overlap the plan's sources) and, separately, **possibly affected** sections (text matches on the plan's key terms) (§11).
- [ ] Banned-term check: case-insensitive, whole-word matching of `glossary.banned_terms`, skipping inline code and code blocks, and honoring each manifest's `allow_terms` (§8). Reported with file, line and preferred term. Available in `docctx check` and to prompts.
- [ ] `review-doc` prompt (§14.3): the doc, its sources, and banned-term findings. It isn't assigned to a milestone in §21; it fits here because it depends on the terminology check.

### Exit criterion

A superseded plan never appears in another doc's resolved scope. `docctx check` reports banned terms with correct line numbers. `plan-to-docs` lists the right docs for a fixture plan.

---

## 11. Phase 8 — Claude Code plugin

**Goal:** the optional plugin in §15.

### Work items

- [ ] Plugin package that preconfigures the MCP server.
- [ ] Skill that expands on the server's `instructions` field: the operating model (§5), when to propose scopes, stale-section triage (§13), section slugs and "only claim what sources support". Kept short, since it loads into context. Slash commands come from the MCP prompts, so the plugin adds none.
- [ ] **Post-edit staleness hook:** after a source file is edited, report which doc sections depend on it. This uses the reverse lookup in the cache.
- [ ] A fast CLI entry point for hooks (for example, `docctx hook <event>`), because hooks run on every matching tool call and must add little latency.

### Deferred

- The **scope-warning hook** is not in v1 (DESIGN.md §15). It needs to know which doc is active in a session, which nothing tracks yet. When built, it warns rather than blocks.

### Exit criterion

With the plugin installed, editing a source file in a fixture repo prints the affected sections. Hook latency is measured and acceptable.

---

## 12. Phase 9 — Release and client coverage

This is a track that runs alongside the other phases rather than a single phase.

- [ ] First 0.x preview on npm after Phase 5. One release at the end of each later phase.
- [ ] `npx` smoke test in CI on all three operating systems, from a packed tarball.
- [ ] Client matrix (§19): re-check prompt and elicitation support in Claude Code, Claude Desktop, Cursor and VS Code at each release. Record the results.
- [ ] For clients without prompt support, a documented tool-based workflow and a pasteable instruction for each prompt (§19). For clients without elicitation, including Claude Desktop, document how chat approvals work and that they are recorded as `via: chat`.
- [ ] User documentation: setup per client, manifest reference, CLI reference, and the honest limits of scope control in agentic clients (§22).
- [ ] Changelog and semantic versioning. Manifest `version: 1` changes require a migration path.

---

## 13. Later

Unscheduled work from §21 and elsewhere in the design:

- Local UI for scope editing, section history comparison and a context budget view.
- A tool to browse and restore local section history.
- Full-text search over sections (FTS5), if `grep` and outlines turn out not to be enough.
- MCP resources (§14.4).
- Section support for non-markdown formats such as OpenAPI.
- An `onboard-docs` prompt, if onboarding a docs folder through repeated `set_scope` calls proves clunky. (A CLI wizard was ruled out: Open question 5.)
- Scope-warning hook (DESIGN.md §15).
- A stricter `--require-human` that rejects `via: chat` approvals (DESIGN.md §13).
- Fewer per-doc manifests through folder rules, sources derived from the doc, or recording files the AI read (Open question 7). Decide after the Phase 5 checkpoint; folder rules are the leading option.
- Line-range or symbol-level sources for very large files (Open question 3 settled v1 behavior: no truncation).
- MCP sampling for optional features (§14.5).

---

## 14. Cross-cutting concerns

### Testing

- **Unit tests** in core for parsing, slugs, merge rules, hashing and staleness state.
- **Golden-file tests** for the explain view and CLI output.
- **Integration tests** driving the MCP server over stdio and the CLI as a subprocess, against fixture workspaces.
- **Security tests** for path confinement: `..`, absolute paths, symlinks inside and outside the root, and globs that would expand outside it.
- **Cross-platform tests** in CI, especially for path separators and case sensitivity.

### Security and safety (§18)

These rules apply from Phase 0 onward, not in a later hardening pass: no network access, path confinement on every path, `write_section` as the only server path that writes a tracked doc (saving the previous content first), manifests and verification records written only by the server after approval, and source text returned as data.

### Token budget (§17)

Measure tool definition size at the end of Phase 3 and re-check at each release. A regression in tool count or description length is treated as a bug.

### Success metrics (§24)

§18 rules out telemetry, so the metrics in §24 can only be measured locally or during dogfooding. Adoption, precision and freshness can be computed from the workspace itself (for example, reported by `get_status` and `docctx check`), and the share of AI versus human verifications from the `verified.by` fields in manifests. How often users change or reject the AI's proposals happens in the conversation, which the server never sees, so it can only be tracked in the Phase 5 friction log.

---

## 15. Design gaps found while planning

These should be resolved in DESIGN.md:

1. ~~**Tool count vs `move`.**~~ Resolved in DESIGN.md v0.3: `move` is CLI-only; revisit in Phase 6.
2. ~~**Unscheduled items.**~~ Resolved in DESIGN.md v0.3: `review-doc` is in M3, resources and search moved to Later, drafts and `docctx status` dropped.
3. ~~**Verification on apply.**~~ Resolved in DESIGN.md v0.2 (§13).
4. ~~**Scope warning trigger.**~~ Deferred in DESIGN.md v0.5: the scope-warning hook is out of v1.
5. ~~**"As a noun" banned terms.**~~ Resolved in DESIGN.md v0.5: the example was replaced, and matching rules are defined in §8.
6. ~~**Prompt-share metric.**~~ Replaced in DESIGN.md v0.2 by an approval-rate metric, which is only measurable during dogfooding. (§14 above)
7. ~~**Binary names.**~~ Resolved in DESIGN.md v0.5: package `contextlabs`, single binary `docctx`.
8. ~~**Elicitation support is unverified.**~~ Checked September 2026: Claude Code and Cursor support it; Claude Desktop does not, so its users approve in chat (`via: chat`); VS Code is still unconfirmed (§19). Re-check at each release (Phase 9).
