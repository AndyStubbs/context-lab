# ContextLabs — Project Design Document


|                  |                    |
| ---------------- | ------------------ |
| **Status**       | Draft              |
| **Version**      | 0.5                |
| **Last updated** | September 25, 2026 |


---

## 1. Summary

ContextLabs is a local-first MCP server that gives technical writers and developers explicit control over what goes into an AI's context when writing and maintaining documentation. Each tracked document has a small YAML manifest, stored in a dedicated folder, that declares which files are authoritative sources, which provide supporting context, and which are excluded. It can do this per section. Agents then draft and revise only from approved material.

The user decides what counts as a source and resolves conflicts. Their AI client does the operating through the MCP server: it proposes scopes, updates the manifests through server tools, and triages stale sections. Where the client supports it, the server asks the user for each decision directly through MCP elicitation (§5).

The server maps source files to the doc sections that depend on them and flags sections that have gone stale because their sources changed. Verification records are committed alongside the manifests, so CI and teammates see the same state. The server never calls an LLM itself. All reasoning is done by the user's own AI client (Claude, Cursor, VS Code, and others) on their existing subscription, so ContextLabs adds no API cost.

---



## 2. Problem

AI assistants are good at drafting technical documentation, but three problems keep coming up:

1. **Scope drift.** When the model decides for itself what to read, it pulls in unrelated files, roadmap plans, or outdated drafts. Documents end up describing features that don't exist, or they mix future plans into product docs.
2. **Context bloat.** Users paste whole files or let the agent read broadly. This wastes tokens, degrades output quality in long sessions, and burns through subscription limits.
3. **Draft and staleness chaos.** Drafts pile up with no history, and nothing tells the writer when a doc no longer matches the code it describes.

Existing tools (project knowledge bases, CLAUDE.md files, editor rules files, skills) provide a place to put context, but not per-document, per-section control over what counts as truth, and none of them track staleness.

---



## 3. Goals and non-goals



### Goals

- **User-controlled context.** The user, not the model, decides what is in scope for each document and section.
- **Zero added token cost.** The server does no LLM calls. It stores, resolves, slices and serves text, and does deterministic checks.
- **Publish-ready docs.** Documents are never modified with metadata. They can be published as they are, by any static site generator.
- **Files as the source of truth.** All human-authored configuration is plain YAML: diffable, mergeable, reviewable in PRs, and editable by hand.
- **Works in and out of repos.** A workspace is any folder. Git improves some features but is never required.
- **Portable across clients.** Anything that speaks MCP can use the core features.



### Non-goals

- Being an editor or a documentation site generator.
- Hosting, syncing, or any cloud service. (Team sharing happens through git.)
- Calling model APIs or managing API keys.
- Hard sandboxing of the model. ContextLabs makes the right context easy and makes drift visible. It cannot fully stop an agentic client from reading other files (see §15).

---



## 4. Target users and use cases

**Primary users:** people writing technical documentation, including developers documenting their own product, technical writers, and engineers writing design plans.

**Core use cases:**


| Use case                                | What ContextLabs provides                                              |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Write a new reference section from code | Loads only that section's declared sources, style guide and glossary   |
| Revise a doc after the code changed     | Lists stale sections and loads exactly the sources that changed        |
| Write or iterate on a design plan       | Plan lifecycle; superseded plans are kept out of other docs' context   |
| Turn a decided plan into product docs   | Follows `implements_into` links to find which docs need updating       |
| Keep terminology consistent             | Always-in-scope glossary plus a deterministic banned-term check        |


---



## 5. Design principles

1. **Decisions go to the user; operations go to the model.** In MCP, tools are *model-controlled*, so tools are how the AI operates. Decisions that belong to the user (approving a scope, resolving a conflict) go to the user directly through elicitation, not through the model's judgment. Prompts are user-controlled and start workflows.
2. **Deterministic where possible.** Scope resolution, staleness and terminology checks are plain code. The model is only involved for writing and for judging whether a source change matters (§13).
3. **Small surface.** Every MCP tool definition sits in context for the whole session. Keep the tool list short and descriptions tight.
4. **Return slices, not files.** Serve one section or one outline instead of whole documents.
5. **Predictable over clever.** Merge rules must be simple enough that a user can guess the resolved scope, and the server must always be able to show it.
6. **Easy exit.** Deleting the `.docctx/` folder leaves the docs exactly as they were.
7. **The user decides; the AI operates.** Nobody should have to hand-edit YAML for every doc. Manifests are the storage format, not the user interface. The server writes them when the AI calls its tools, and the user approves what goes in them.

### Operating model

| Task                                                   | Who                                                 |
| ------------------------------------------------------ | --------------------------------------------------- |
| Choose which files a doc or section depends on (scope) | AI proposes; user approves                          |
| Create and update manifests                            | The server, when the AI calls `set_scope` (users may still edit by hand) |
| Load context, write sections                           | AI, through MCP tools                               |
| Flag stale sections                                    | The server, deterministically from hashes (§13)     |
| Triage stale sections                                  | AI (§13)                                            |
| Resolve conflicts and accept revisions                 | User                                                |
| Verify sections                                        | User, or AI for changes it judges to have no impact |

**Approval** comes from the user, not the model. When the AI calls a tool that needs a decision, such as `set_scope` or `confirm_section`, the server asks the user directly through MCP elicitation, for example "Use `src/auth/refresh.ts` as the source for *Token refresh*? Accept / Decline". The server acts only on the user's answer, and it knows the answer came from the user. In clients without elicitation, the AI asks in chat and passes the user's answer to the tool. The server records that the approval came via chat, since it cannot confirm it (§13). Changes to an existing scope are approved the same way. In a repo, the committed YAML diff gives reviewers a second checkpoint.

The AI should not edit manifests or verification records with its own file tools. Going through the server keeps the YAML valid, preserves comments, and makes sure every change passes through an approval.

The user's two decisions, **what counts as a source** and **when a section is correct**, are the whole value of the system. Everything else can be delegated. If the AI chose its own sources, the result would be the scope drift described in §2.

---



## 6. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  AI client (Claude Desktop, Claude Code, Cursor, VS Code) │
│  — runs the model on the user's subscription             │
└───────────────┬──────────────────────────────────────────┘
                │ MCP (stdio)
┌───────────────▼──────────────┐   ┌───────────────────────┐
│  MCP server (main interface)  │   │  CLI (`docctx`)       │
│  tools · elicitation · prompts│   │  serve, init, scope,  │
│  (`docctx serve`)             │   │  check, hook, move,   │
│                               │   │  relink               │
└───────────────┬──────────────┘   └──────────┬────────────┘
                └──────────────┬──────────────┘
                ┌──────────────▼──────────────┐
                │  Core library               │
                │  manifest read/write ·      │
                │  scope resolution ·         │
                │  sections · staleness       │
                └───────┬──────────────┬──────┘
                        │              │
          ┌─────────────▼───┐   ┌──────▼─────────────┐
          │ YAML files      │   │ Local files        │
          │ (manifests +    │   │ (gitignored:       │
          │  lock files,    │   │  cache.json,       │
          │  committed)     │   │  .history/)        │
          └─────────────────┘   └────────────────────┘
```

**Layers:**

1. **File format.** `workspace.yaml`, plus one manifest and one lock file per tracked doc. Manifests hold scope and verification records; lock files hold source hashes. This is the real product. Everything else is an adapter.
2. **Core library.** All logic, independent of MCP.
3. **MCP server.** The main interface. AI clients use its tools to load context, write sections, and maintain scope and verification. It asks the user for decisions through elicitation.
4. **CLI.** For what MCP can't do: setup, CI checks (for example, fail the build if docs are stale), hooks, debugging scope, and moving docs. `docctx serve` starts the MCP server.
5. **Claude Code plugin (optional).** Bundles the MCP server with a skill and hooks.
6. **Local UI (future).** Visual scope editing, history comparison, context budget view.

---



## 7. Workspace layout

A workspace is any folder containing a `.docctx/` directory. Manifests mirror the path of the doc they describe, keeping the original file extension to avoid name clashes.

```
my-project/
├── docs/
│   ├── auth/
│   │   ├── overview.md
│   │   └── tokens.md
│   ├── _style.md
│   └── _glossary.md
├── plans/
│   └── auth-v2.md
├── src/...
└── .docctx/
    ├── workspace.yaml                 # committed
    ├── docs/auth/overview.md.yaml     # committed: manifest (scope + verification records)
    ├── docs/auth/overview.md.lock     # committed: source hashes, written by the server
    ├── docs/auth/tokens.md.yaml       # committed
    ├── plans/auth-v2.md.yaml          # committed
    ├── cache.json                     # gitignored, rebuildable (§12)
    └── .history/                      # gitignored, local section history (§12)
```

Each tracked doc has a manifest (`<doc path>.yaml`) and, once any part of it has been verified, a lock file (`<doc path>.lock`) beside it (§13). Because manifests always end in `.yaml` and lock files never do, no doc path can map onto another doc's lock file.

`docctx init` adds `.docctx/cache.json` and `.docctx/.history/` to `.gitignore`, and marks `.docctx/**/*.lock` as `linguist-generated` in `.gitattributes` so that code review tools collapse hash-only diffs.

Two doc paths are reserved and can't be tracked, because their metadata paths would collide with ContextLabs' own files: a root-level doc named `workspace` (its manifest would be `workspace.yaml`) and anything under a root-level `.history/` folder.

**Tracking is opt-in.** A doc with a manifest is managed. A doc without one is ignored, except when listed as a source or context file for another doc. Manifests are normally created by the server when the AI calls `set_scope` and the user approves the doc's scope (§5).

All paths in manifests are relative to the workspace root. Globs are allowed.

---



## 8. `workspace.yaml` specification

```yaml
version: 1

defaults:
  context:
    - docs/_style.md
    - docs/_glossary.md
  exclude:
    - "**/drafts/archive/**"
    - "**/node_modules/**"

types:
  reference:
    statuses: [draft, review, published, deprecated]
  guide:
    statuses: [draft, review, published, deprecated]
  plan:
    statuses: [draft, proposed, decided, superseded]
    exclude_from_context_when: [superseded]

glossary:
  file: docs/_glossary.md
  banned_terms:
    - term: "whitelist"
      prefer: "allowlist"
    - term: "e-mail"
      prefer: "email"

settings:
  hash_algorithm: sha256
  max_context_bytes: 200000   # get_scope returns no file contents above this (§14)
  max_diff_bytes: 20000       # per stale section; above this, triage gets a git log summary (§13)
```

**Banned terms** are matched deterministically: case-insensitive, whole words only, and never inside inline code or code blocks. The check can't understand grammar, so terms must be unambiguous as plain words. A doc that legitimately needs a banned term lists it under `allow_terms` in its manifest, never in an inline comment, since that would put metadata in the doc.

---



## 9. Doc manifest specification

```yaml
# .docctx/docs/auth/overview.md.yaml
doc: docs/auth/overview.md
type: reference
status: review
audience: integrators

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
    verified:                     # written by the server (§13)
      at: 2026-09-25T14:02:00Z
      by: ai                      # human | ai
      note: "Rename only; no documented behavior changed."
  error-codes:
    sources: [src/auth/errors.ts]
    context: [docs/_error-format.md]
```

The server writes and maintains manifests on the user's behalf when the AI calls `set_scope` (§5, §14). The format stays human-readable and hand-editable, because it is also what reviewers see in diffs, and because users may still edit it directly.



### Fields


| Field             | Required | Type                                   | Description                                                                                    |
| ----------------- | -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `doc`             | yes      | path                                   | The document this manifest describes. Authoritative even if the manifest's own path disagrees. |
| `type`            | yes      | string                                 | A type defined in `workspace.yaml`.                                                            |
| `status`          | yes      | string                                 | Must be one of the type's statuses.                                                            |
| `audience`        | no       | string                                 | Free text, passed to the model in prompts.                                                     |
| `sources`         | no       | list of globs                          | Authoritative material.                                                                        |
| `context`         | no       | list of globs, or `{ replace: [...] }` | Supporting material.                                                                           |
| `exclude`         | no       | list of globs                          | Never included, regardless of other rules.                                                     |
| `sections`        | no       | map of slug → scope                    | Per-section overrides (see §10) and verification records.                                      |
| `verified`        | no       | verification record                    | Written by the server, never by hand (§13). Inside a section entry; at the top level only for docs without sections. |
| `supersedes`      | no       | path                                   | Plans only. The plan this one replaces.                                                        |
| `implements_into` | no       | list of paths                          | Plans only. Product docs this plan affects.                                                    |
| `decided_on`      | no       | date                                   | Plans only.                                                                                    |
| `allow_terms`     | no       | list of strings                        | Banned terms (§8) this doc may use.                                                            |
| `owner`           | no       | string                                 | Free text.                                                                                     |




### Scope resolution rules

The resolved scope for a doc or section is computed as follows:

1. Start with workspace `defaults`.
2. Merge the doc-level fields. **Lists merge; scalars override.** A `{ replace: [...] }` form replaces instead of merging.
3. For a section, merge that section's fields on top of the doc-level result using the same rules. Section `sources`, if present, **replace** doc-level sources for that section, since the point of section scoping is to narrow.
4. Apply all `exclude` patterns last. **Exclude always wins.**
5. Drop any doc whose type rules exclude it at its current status (for example, superseded plans).
6. Expand globs against the workspace, deduplicate, and sort.

The server must be able to show the resolved scope (`docctx scope <doc> [section]`, and the `get_scope` and `set_scope` tools), including *why* each file is in or out.

In practice:

- Steps 4 and 5 are applied to the expanded files, since patterns can't be subtracted from patterns. The result is the same as the order above.
- Exclude patterns filter `sources` as well as `context`. Type rules do too, so a superseded plan never appears in another doc's scope, even when named as a source.
- A file matched by both `sources` and `context` is a source. Every entry lists all the rules and patterns that matched it.
- A pattern that matches no files, such as a typo or a deleted source, is reported as a warning. It isn't an error.
- If another doc in scope has an invalid manifest, its status can't be known, so that doc is left out and the broken manifest is reported.
- `.git/` and `.docctx/` are never in scope. `*` and `**` don't match dotfiles, but a pattern that names a dot folder does (`.github/**`). Excludes match dotfiles too.
- Symlinked directories aren't followed. Any symlink that leads outside the workspace is reported as excluded (§18).

---



## 10. Sections

- A section is a markdown heading and everything below it until the next heading of the same or higher level.
- Section keys are GitHub-style slugs of the heading text (lowercase, spaces to hyphens, punctuation removed).
- Duplicate slugs within a doc are disambiguated by parent path, for example `setup/install` and `upgrade/install`. The key uses the shortest path suffix that no other heading with that slug shares. When even the full path is shared (two `## Install` under one `# Setup`), the first heading keeps it and later ones get `-1`, `-2`, and so on, as GitHub does for anchors. Such keys depend on heading order, so the server warns about them.
- Only top-level headings start sections. Headings inside block quotes, lists, HTML or code blocks don't, and YAML or TOML front matter is skipped. A heading with no text has no key, but it still ends the section before it.
- If a section key in a manifest no longer matches any heading, the server reports it as **orphaned**. It is never silently dropped.

Non-markdown docs (for example, OpenAPI files) are tracked as a single unit with no sections in v1. Markdown means the `.md` and `.markdown` extensions; `.mdx` is a single unit for now.

---



## 11. Doc types and lifecycle


| Type        | Lifecycle                               | Notes                                                                                                                                                   |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reference` | draft → review → published → deprecated | Describes what the product does.                                                                                                                        |
| `guide`     | draft → review → published → deprecated | Task-oriented how-tos.                                                                                                                                  |
| `plan`      | draft → proposed → decided → superseded | Superseded plans are excluded from other docs' context by default. Decided plans with `implements_into` surface a to-do list of product docs to update (see below). |


Types and statuses are configurable in `workspace.yaml`. These three ship as defaults.

**Affected sections.** For a decided plan, a section in an `implements_into` doc is **affected** when its resolved sources overlap the plan's resolved sources. This is deterministic. Sections that only mention the plan's key terms are listed separately as **possibly affected**, so the two signals are never mixed.

---



## 12. Local cache and history

ContextLabs keeps no database. Everything that matters is committed YAML (§7, §13). Two gitignored locations hold local data:

- **`.docctx/cache.json`** is a disposable cache. It holds a fingerprint of each file it has hashed: the hash and the stat it was taken from (for the §13 pre-check). Since a doc is a file, that includes each tracked doc's last known content hash (for move detection, §16). A reverse lookup from each source file to the sections that depend on it (for the post-edit hook, §15) is added with the hook. Its exact contents are an implementation detail, with one rule: deleting it, or finding it stale, corrupt or from another format version, must never change a result. The server just rebuilds it. Writes go to a temporary file that is then renamed over the old one, so a crash can't leave it half-written.
- **`.docctx/.history/`** is local section history: the previous content of every section the server overwrote with `write_section` (§18), one file per version, for example `.history/docs/auth/overview.md/token-refresh/0003.md`. A doc without sections uses `@doc` in place of the slug (slugs never contain `@`). Version files take the doc's own extension (`0003.md`, or `0001.yaml` for an OpenAPI doc) and are numbered from `0001`, continuing after the highest existing number. Each save claims its number exclusively, so concurrent saves never overwrite each other. Versions are never pruned in v1. It's a safety net only. Git remains the real history, and nothing else depends on it.

SQLite was part of earlier drafts. It was dropped in v0.4 once verification records moved into committed YAML and drafts and full-text search left v1. The core reads and writes the cache through a small interface, so an embedded database can be swapped in if dogfooding shows the reverse lookup or hashing is too slow in large repos.

---



## 13. Staleness detection

1. When a section is **verified**, the server records the current hash of every file in that section's resolved `sources`. Each record also stores when it was made, who decided (`human` or `ai`), how a human decision reached the server (`elicitation` or `chat`), and an optional note.
2. A section is **stale** when any of those source files now has a different hash, has been deleted, or when the resolved source list itself has changed.
3. Hashing uses the file's stat as a fast pre-check and only rehashes files whose metadata changed. The check compares size, mtime, ctime and inode, since tools like `cp -p` and `rsync -t` restore mtime but can't set ctime. A file modified within 2 s of being hashed is always rehashed, since it may have changed again within the same timestamp tick (as git does).
4. Sections never verified are reported as **unverified**, not stale.

"Stale" means only that a section's sources changed since it was last checked. It does not mean the doc is wrong. The server decides staleness mechanically; judging whether a change matters is left to triage.

This works without git. When git is available, the stale report can also include `git log` entries and a diff for the changed sources since the verification, up to `settings.max_diff_bytes` per section (default 20 KB). Above that, it sends `git log --stat` only, and the AI reads the files itself. This gives the model a compact summary of what changed instead of full files. Without git, triage compares the section against the current sources.

### Verification records

Verification records are committed, split across two files per doc:

- **The manifest** holds what a reviewer needs to see: when the section was verified, who decided, and why. It sits next to the section's scope, so a diff shows "sources changed" and "re-verified by the AI" together.
- **The lock file** (`<doc path>.lock`, beside the manifest) holds the hash of every resolved source at that moment. Broad globs can resolve to dozens of files, and keeping their hashes out of the manifest keeps manifests short and readable.

Committing both is what makes the CI check work on a fresh clone and lets teammates share verifications. Only the server writes either file: manifests with the `yaml` `Document` API, lock files in full with sorted keys so diffs stay minimal.

Manifest:

```yaml
sections:
  token-refresh:
    sources: [src/auth/refresh.ts]
    verified:
      at: 2026-09-25T14:02:00Z
      by: human               # human | ai
      via: elicitation        # elicitation | chat; human decisions only
      note: "Confirmed after refresh interval change."
```

Lock file (`overview.md.lock`):

```yaml
# Written by ContextLabs. Do not edit.
version: 1
algorithm: sha256
sections:
  token-refresh:
    at: 2026-09-25T14:02:00Z   # must match verified.at in the manifest
    hashes:
      src/auth/refresh.ts: 9f2c41d07ab3e815
```

Hashes are stored as the first 16 hex characters of the configured algorithm, which is plenty for change detection. A doc without sections uses top-level `verified` and `doc` entries in place of `sections`. The set of paths under `hashes` is the resolved source list at verification, which is how a changed source list is detected.

**If the two files disagree** (for example after a bad merge or a hand edit), the result always errs toward checking again:

| Manifest `verified`  | Lock entry                         | Section state                             |
| -------------------- | ---------------------------------- | ----------------------------------------- |
| present              | present, same `at`                 | Computed normally from the hashes         |
| present              | missing, or a different `at`       | **Stale**                                 |
| missing              | present or missing                 | **Unverified**; a leftover lock entry is removed on the next write |

Changing `settings.hash_algorithm` makes every verified section stale, since old and new hashes can't be compared.

### Triage and conflict resolution

Stale sections are triaged by the AI and resolved by the user:

| Outcome       | Meaning                                                                                     | What happens                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **No impact** | The change doesn't affect anything the section claims (rename, reformat, internal refactor) | The AI calls `mark_no_impact` with a note explaining why. This records `by: ai`.             |
| **Conflict**  | The section now contradicts its sources                                                     | The AI calls `confirm_section` with the specific claim, what the source now says, and a proposed fix. |
| **Unsure**    | The AI can't tell                                                                           | Treated as a conflict.                                                                                |

`confirm_section` asks the user directly (§14.2). The user can apply the proposed fix, keep the section as it is (for example, "the doc is intentionally simplified"), or leave it stale. Applying or keeping records `by: human`. The same tool handles a section's first verification after it is written. A section the AI writes with `write_section` is never verified by that write.

Triage adds no new state. A section stays stale until someone verifies it, so an unresolved conflict simply remains in the stale list. All judgment happens in the AI client. The server only flags, asks and records.

A human verification that arrives through elicitation is known to come from the user. One that arrives through chat (`via: chat`) is reported by the client, and so is any `ai` verification. These records exist for auditing and CI policy, not as a security boundary.

**CI use:** `docctx check --stale --fail-on published` exits non-zero if any published doc has stale sections. Adding `--require-human published` also fails when a published doc's section was last verified by the AI, so AI dismissals count only for docs at other statuses. A stricter option that also rejects `via: chat` approvals is not in v1: it would fail every approval made in Claude Desktop, which has no elicitation (§19). Because `via` is already recorded, it can be added later without changing any data.

---



## 14. MCP interface

The MCP server is the main interface. AI clients use its tools to do the work, and the server sends decisions to the user through elicitation. The server's `instructions` field (returned when a client connects) carries a short summary of the operating model (§5): propose scopes through `set_scope`, never edit `.docctx/` files directly, triage stale sections, and only use `mark_no_impact` for changes that affect nothing the section claims. Claude Code caps this field at 2 KB, so the summary must fit in that; the plugin's skill (§15) carries the longer version.

### 14.1 Tools (model-controlled; kept small)


| Tool              | Purpose                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_status`      | Without `doc`: workspace summary (docs by status, stale, unverified and orphaned items). With `doc`: its outline with each section's state, and change summaries for stale sections. |
| `read_section`    | Return one section's text by doc and slug.                                                                                                                  |
| `get_scope`       | Resolved sources and context for a doc or section, with the reason and size of each file. With `content: true`, also returns file contents, unless the scope exceeds `max_context_bytes` (see below). |
| `set_scope`       | Propose sources, context or excludes for a doc or section, creating the manifest if needed. The server shows the resolved result to the user and writes it only if they accept. |
| `write_section`   | Replace one section's text. The previous content is saved to local section history first (§18). Does not verify the section.                                |
| `mark_no_impact`  | Verify a stale section whose source changes don't affect anything it claims. Records `by: ai` with a required note.                                |
| `confirm_section` | Ask the user to confirm a section, optionally with a conflict summary and proposed text. The user can apply the fix, keep the section as is, or leave it stale. |


Tool descriptions are kept to one or two sentences each. Every tool returns compact, structured output.

The AI can load context in two ways. Agentic clients with file access can call `get_scope` for paths and read the files themselves. Clients without file access, such as Claude Desktop, use `get_scope` with `content: true`.

**Large scopes are never truncated.** A model given half a file writes confident claims from half the facts. If `content: true` would exceed `max_context_bytes`, `get_scope` returns only paths, sizes and a warning, and the AI should propose a narrower section scope through `set_scope`. Line-range or symbol-level sources may come later.

### 14.2 Elicitation (user decisions)

`set_scope` and `confirm_section` need a decision from the user. When the client supports elicitation, the server asks the user directly with a short message and a simple choice, then acts on the answer:

- `set_scope`: "Set sources for *Token refresh* in `docs/auth/overview.md` to `src/auth/refresh.ts`? Resolved scope: 1 source, 3 context files, 14 KB." → **Accept** / **Decline**.
- `confirm_section`: "*Token refresh* says tokens refresh after 5 minutes; `refresh.ts` now uses 10. Proposed fix: …" → **Apply fix** / **Keep as is** / **Leave stale**.

Messages are at most three lines and always name the doc, the section, the files involved and the resolved size. A declined or cancelled request changes nothing.

**Fallback.** If the client does not support elicitation, these tools return the preview and a note telling the AI to ask the user in chat. The AI then calls the tool again with `user_decision` (an enum with the same choices as the elicitation form) and an optional `user_note`, and the record stores `via: chat`. When the client does support elicitation, the server rejects both parameters, so the AI can't skip asking the user. Claude Desktop has no elicitation (§19), so for its users this fallback is the main path and gets the same care and testing.

### 14.3 Prompts (user-controlled)


| Prompt           | Arguments                       | Behavior                                                                                                                   |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `draft-section`  | `doc`, `section`                | Loads the resolved scope, audience and style rules, and instructs the model to write only claims supported by the sources. |
| `revise-section` | `doc`, `section`, `instruction` | Loads current section text plus scope. Asks for a targeted revision.                                                       |
| `refresh-stale`  | `doc` (optional)                | Loads stale sections plus summaries of what changed in their sources, and asks the model to triage each one (§13).         |
| `review-doc`     | `doc`                           | Loads the doc and its sources and asks for an accuracy and terminology review.                                             |
| `plan-to-docs`   | `plan`                          | For a decided plan, lists `implements_into` docs and their affected sections (§11).                                        |


Prompts are how a user starts a workflow. In Claude Code they appear as slash commands. The same workflows also work without prompts, because the tools and the `instructions` field cover them. Every prompt includes a short instruction to state explicitly when the sources don't support something, rather than guessing.

### 14.4 Resources

Not in v1. The information that resources would have exposed (outlines, sections, scope, status) is available through the tools above, and agentic clients rarely attach resources. Resources may be added later for clients that make good use of them.

### 14.5 Sampling

Not used in v1. It may be considered later for optional features (for example, summarizing source changes), but only through the client's model via MCP sampling, never a direct API call, and only where the client supports it.

---



## 15. Claude Code plugin

An optional plugin packages extras for repo-based users:

- **The MCP server**, preconfigured.
- **A skill** that expands on the server's `instructions` field: the operating model (§5), when to propose scopes, how to triage stale sections (§13), section slugs, and "only claim what sources support." Skills load only when relevant, so this costs little context.
- **A post-edit staleness hook:** after a source file is edited, report which doc sections now depend on changed code. It uses the reverse lookup in the cache (§12).

A **scope-warning hook**, which would warn when the model reads files outside the active doc's resolved scope, is deferred past v1. It needs to know which doc is "active" in a session, and nothing tracks that yet. When built, it warns rather than blocks. Hooks are the only mechanism that can *enforce* scope rather than just encourage it. The MCP server alone cannot stop an agentic client from reading other files. The MCP prompts (§14.3) already appear as slash commands in Claude Code, so the plugin doesn't need its own.

---



## 16. Moves, renames and orphans

Because manifests live outside the docs, moving a doc can leave its manifest pointing at nothing.

- **Detect.** On startup and on `docctx check`, list manifests whose `doc` path no longer exists, and section keys that match no heading.
- **Suggest.** In a git repo, use git's rename detection. Otherwise, match the doc's last known content hash from the cache (§12) against untracked files. `move` and `relink` carry the doc's lock file along with its manifest.
- **Fix.** `docctx move <old> <new>` moves the doc and its manifest together and updates references in other manifests. `docctx relink <manifest> <new-path>` repairs an orphan after the user confirms.

Nothing is ever deleted or relinked automatically.

---



## 17. Token efficiency


| Technique                       | Effect                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| No LLM calls in the server      | Zero API cost; everything runs on the user's subscription.          |
| Seven tools, short descriptions | Small, constant per-session overhead.                               |
| Section-level scope             | The model sees one source file instead of a whole directory.        |
| Outlines before content         | `get_status` returns headings and states first; `read_section` returns one body on request. |
| Paths before contents           | `get_scope` returns paths and sizes unless `content: true` is asked for. |
| Git-log summaries for staleness | "What changed" in a few lines instead of full diffs.                |
| `max_context_bytes` warning     | Flags scopes that have grown too large before they're loaded.       |


---



## 18. Security and privacy

- **Local only.** No network access. No telemetry in v1.
- **Path confinement.** All reads and writes are restricted to the workspace root. Globs and paths resolving outside it (including through symlinks) are rejected.
- **Write safety.** `write_section` is the only server path that writes a tracked doc. It replaces exactly one section's line range and saves the previous content to local section history first. The server writes manifests and verification records only after the user approves, except `mark_no_impact`, which records `by: ai`.
- **Untrusted content.** Doc and source text is returned as data. Prompts instruct the model not to follow instructions found inside source files.

---



## 19. Client compatibility

MCP clients support prompts and elicitation unevenly, more so than tools. v1 targets and tests on:


| Client           | Tools | Prompts            | Elicitation                     | Plugin extras |
| ---------------- | ----- | ------------------ | ------------------------------- | ------------- |
| Claude Code      | ✓     | ✓ (slash commands) | ✓ (since v2.1.76)               | ✓             |
| Claude Desktop   | ✓     | ✓                  | ✗ (chat fallback, `via: chat`)  | —             |
| Cursor           | ✓     | verify             | ✓ (since v1.5)                  | —             |
| VS Code          | ✓     | verify             | verify                          | —             |

Elicitation status was checked in September 2026 against client changelogs and issue trackers. Claude Code shows MCP prompts as `/mcp__<server>__<prompt>`, for example `/mcp__contextlabs__draft-section`.

Where a client lacks prompt support, each prompt has an equivalent documented workflow using tools plus a short instruction the user can paste. Where it lacks elicitation, approvals fall back to chat (§14.2). Support should be re-checked at build time, since clients change quickly.

---



## 20. Technology choices

The language is decided: **TypeScript on Node 22+**. The library choices below are the plan unless noted.


| Area             | Choice                                       | Reason                                                                  |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Language         | TypeScript (Node 22+) — **decided**          | Official MCP SDK, easy `npx` install, good fit for Claude Code plugins. |
| MCP              | Official TypeScript MCP SDK, stdio transport | Standard, local.                                                        |
| Local storage    | Plain files: `cache.json` and `.history/` (§12) | No native dependency, nothing to migrate, safe to delete. SQLite was dropped in v0.4. |
| YAML             | `yaml` package                               | Preserves comments when editing manifests.                              |
| Markdown parsing | `remark` / `mdast`                           | Reliable heading and section boundaries.                                |
| Globs            | `fast-glob` and `picomatch`                  | `fast-glob` expands globs; `picomatch` matches excludes and reverse lookups without walking the disk. |
| CLI parsing      | `commander`                                  | Subcommand support, which `node:util` `parseArgs` lacks.                |
| Tests            | Vitest                                       | Snapshot support suits the golden-file tests of the explain view.       |
| Distribution     | npm package `contextlabs` with a single `docctx` binary | With only one binary, `npx` runs it: `npx -y contextlabs serve` for the MCP server, `npx contextlabs check ...` in CI. |


**Alternatives considered:**

- **C#** was rejected. The official C# MCP SDK and Markdig would both work. However, YamlDotNet does not preserve comments when rewriting manifests, which `set_scope`, verification records and `docctx move`/`relink` all need (§13, §14, §16). Distribution would also require the .NET SDK or per-OS self-contained binaries instead of `npx`.
- **Python** (with the Python MCP SDK) was also viable but not chosen.

Coding conventions are in [`CONV_TYPESCRIPT.md`](CONV_TYPESCRIPT.md).

---



## 21. MVP scope and milestones



### Milestone 1 — Core (MVP)

- `workspace.yaml` and manifest parsing with validation errors that point to the line.
- Manifest writing with the `yaml` `Document` API, preserving comments.
- Scope resolution and the `docctx scope` explain view.
- Section parsing and slugs.
- Local cache and section history (§12).
- MCP: the `instructions` field; `get_status` (outlines), `read_section`, `get_scope`, `set_scope` (with elicitation and the chat fallback) and `write_section` tools; `draft-section` and `revise-section` prompts.
- CLI: `init`, `scope`.

### Milestone 2 — Staleness

- File hashing, verification records in manifests, and lock files.
- Section states and change summaries in `get_status`; `mark_no_impact` and `confirm_section` tools; `refresh-stale` prompt.
- `docctx check` for CI, including `--require-human`.
- Orphan detection, `move` and `relink`.

**Exit criterion (M1 and the staleness part of M2 together):** the author uses it for two weeks on real docs, sets scopes by approving the AI's proposals rather than editing YAML, reaches for it instead of pasting context by hand, and finds that stale flags catch real drift. The checkpoint comes after staleness because staleness is what no other tool provides. Judging the project on context loading alone would test its weakest claim.



### Milestone 3 — Plans and terminology

- Plan lifecycle, `supersedes`, `implements_into`, `plan-to-docs` prompt.
- Banned-term check and `review-doc` prompt.



### Milestone 4 — Claude Code plugin

- Skill and the post-edit staleness hook. Slash commands come from the MCP prompts.



### Later

- Local UI for scope editing, section history comparison and a context budget view.
- Browsing and restoring local section history through a tool.
- Full-text search over sections (FTS5), if `grep` and outlines turn out not to be enough.
- MCP resources (§14.4).
- Scope-warning hook (§15).
- Line-range or symbol-level sources for very large files.
- A stricter `--require-human` that rejects `via: chat` approvals (§13).
- An `onboard-docs` prompt, if onboarding a docs folder through repeated `set_scope` calls proves clunky.
- Section support for non-markdown formats.

---



## 22. Risks


| Risk                                                           | Mitigation                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Overlap with built-in features (projects, rules files, skills) | Focus on what they lack: per-section source scoping, staleness and verification. |
| Scope control is advisory in agentic clients                   | Be honest about it in docs; a scope-warning hook in Claude Code later (§15).   |
| Uneven prompt/elicitation support across clients               | Test per client; tool-based workflows without prompts; chat approvals (recorded as `via: chat`) without elicitation. |
| Manifest drift after moves and heading renames                 | Orphan detection, suggestions, and move/relink commands.                       |
| Merge rules confuse users                                      | Keep rules minimal; always provide the explain view.                           |
| Local section history lost if `.docctx/.history/` is deleted   | Git is the real history; `.history/` is only a safety net. Verification records and hashes are committed, so they are never lost this way. |
| Manifest and lock file disagree after a merge or hand edit     | Mismatches always resolve to stale or unverified (§13), never to verified. |
| AI proposes scopes that are too broad                          | User approval before any manifest is written; YAML diff in review; `max_context_bytes` warning. |
| AI triages a real conflict as "no impact"                      | `by` and notes make AI dismissals auditable; `--require-human` in CI for published docs. |


---



## 23. Open questions

1. ~~Should verification happen automatically when a revision is applied, or only when the user says so?~~ **Resolved in v0.2:** applying a revision verifies only when the user accepted it; the AI may verify on its own only for changes it triages as no impact, recorded as `by: ai` (§13).
2. ~~Should `index.db` draft history be exportable to files by default, for teams that want shared drafts?~~ **Moot in v0.3:** drafts were replaced by local section history, and git is the shared history.
3. ~~How should very large source files be handled?~~ **Resolved in v0.5:** never truncate; above `max_context_bytes`, `get_scope` returns paths and sizes, and the AI proposes a narrower scope (§14.1).
4. ~~Should the server watch files for changes, or only check on demand?~~ **Resolved in v0.5:** on demand, using the stat pre-check (§13). A stdio server that exits with its client gains little from watching.
5. ~~Is a `docctx init` wizard that suggests manifests worth building in v1?~~ **Resolved in v0.5:** no. The AI proposes scopes for an existing docs folder through `set_scope`, and the user approves each one (§5).
6. ~~How does the AI learn the operating model (§5) before the Claude Code plugin exists, and in clients without skills?~~ **Resolved in v0.3:** the MCP server's `instructions` field (§14), expanded by the plugin's skill (§15).
7. Should fewer docs need their own manifest? Options: folder-level rules in `workspace.yaml` (for example, `docs/auth/**` → `src/auth/**`), deriving sources from paths and links already in the doc, or recording the files the AI actually read when writing. Each still needs user approval, and folder rules would add a step to the §9 resolution order. **Deferred until after the dogfooding checkpoint (§21).** Folder rules are the leading option, being the most predictable.
8. ~~Where do committed verification records live?~~ **Resolved in v0.4:** the record (when, who, why) goes in the manifest next to the scope; source hashes go in a per-doc `.lock` file beside it (§13).

---



## 24. Success metrics

- **Adoption:** number of tracked docs per workspace over time.
- **Precision:** average resolved scope size (bytes) for `draft-section`, compared with pasting whole folders.
- **Freshness:** share of published sections that are verified and not stale.
- **Use:** how often users change or reject the AI's proposed scopes and conflict fixes. A non-zero rate shows the approval step is doing real work; a rate near zero suggests it could be lighter.
- **Qualitative:** fewer corrections for invented behavior or plan content leaking into product docs.

