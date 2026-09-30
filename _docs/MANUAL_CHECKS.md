# Manual checks in real clients

Automated tests drive the server through the SDK's own client. These checks cover what they can't: how Claude Code and Claude Desktop present tools, elicitation, the chat fallback and prompts to a person (DESIGN.md §19). Run them at the end of each phase that changes the MCP surface, and before each release (ROADMAP.md Phase 9). Record what you see under **Results**, with the date and client versions.

## Setup

**1. Build the server** from the repo root:

```bash
npm ci && npm run build
```

**2. Make a scratch workspace** from the `basic` fixture, with git so every write shows up as a diff:

```bash
cp -r test/fixtures/basic ~/docctx-check
node dist/cli/main.js init ~/docctx-check
cd ~/docctx-check && git init -q && git add -A && git commit -qm "Start" && cd -
```

`init` is safe on an existing workspace: it only adds the `.gitignore` and `.gitattributes` lines.

**3. Register the server.** Clients start the server without loading your shell profile, so every path must be absolute. Replace these placeholders below:

| Placeholder | What it is | How to find it |
| ----------- | ---------- | -------------- |
| `<node>` | The full path to the `node` program. With nvm it looks like `/home/you/.nvm/versions/node/v24.19.0/bin/node`, and it changes when you switch Node versions. | `which node` (`where node` on Windows) |
| `<repo>` | The context-lab checkout, such as `/home/you/src/context-lab`. | `pwd` in the repo root |
| `<workspace>` | The scratch workspace from step 2, such as `/home/you/docctx-check`. JSON doesn't expand `~`, so write it out. | `echo ~/docctx-check` |

Claude Code, from inside the scratch workspace. The shell expands `$(which node)` and `~` here, so only `<repo>` needs replacing:

```bash
claude mcp add contextlabs -- "$(which node)" <repo>/dist/cli/main.js serve --workspace ~/docctx-check
```

Claude Desktop: add the `contextlabs` entry to `claude_desktop_config.json` (`~/.config/Claude/` on Linux, `~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows), inside its `mcpServers` block if it already has one, then restart Claude Desktop:

```json
{
	"mcpServers": {
		"contextlabs": {
			"command": "<node>",
			"args": [ "<repo>/dist/cli/main.js", "serve", "--workspace", "<workspace>" ]
		}
	}
}
```

If the server doesn't show up, the path to `node` is the usual cause: Claude Desktop can't find a bare `"command": "node"` installed through nvm.

**Claude Code in the desktop app's Code tab** runs Claude Code in print mode, which declines elicitation requests without showing them. Add `--approvals chat` to the end of the server command there, or `set_scope` proposals all come back declined. The C steps below are for `claude` in a terminal, which does show the forms.

A session keeps the server process it started with, so a changed registration, or a rebuilt `dist/`, only reaches new sessions, or an existing one after it reconnects the server from `/mcp`. The server's first stderr lines, in the client's MCP log, show which options it started with.

To start over between runs: `cd ~/docctx-check && git checkout -- . && git clean -fdq`, which keeps the gitignored `.docctx/.history/`, so delete it too for a clean slate.

## Claude Code

| # | Do | Expect |
| - | -- | ------ |
| C1 | Run `/mcp`. | `contextlabs` is connected, with 5 tools and 2 prompts. |
| C2 | Run `/context`. | Record the tokens the MCP tools take; compare with the baseline in ROADMAP.md Phase 3. |
| C3 | Ask: "What docs does ContextLabs track here?" | The AI calls `get_status` and lists 3 docs by type and status. |
| C4 | Ask: "Propose sources for the Setup section of docs/auth/overview.md." | The AI calls `set_scope`, and an elicitation form appears with the three-line message. **Record how the empty form renders**: are Accept and Decline clear on their own? (PR 2 decision 3; the fallback is a single yes/no field.) |
| C5 | Accept. | `git diff` shows a `setup:` entry under `sections:` in `.docctx/docs/auth/overview.md.yaml`, and the aligned comments lose their alignment (known; tracked separately). |
| C6 | Ask for another change, such as adding an exclude, and decline. | Nothing changes on disk, and the AI says it was declined. |
| C7 | Type `/mcp__contextlabs__draft-section`, and use completion for `doc` and `section`. | Completion offers tracked docs, then that doc's section keys. **Record whether completion shows up at all.** |
| C8 | Run it for `docs/auth/overview.md`, `token-refresh`. | The AI drafts from `src/auth/refresh.ts` only, calls `write_section`, and summarizes. `git diff` changes only that section; `.docctx/.history/docs/auth/overview.md/token-refresh/0001.md` holds the old text. |
| C9 | Run `/mcp__contextlabs__revise-section` on the same section with an instruction such as "Add the token lifetime in seconds." | A targeted change, written the same way, as version `0002`. |
| C10 | Ask it to rename the "Token refresh" heading. | `write_section` refuses: the key `token-refresh` has its own scope. The AI explains and doesn't try to edit the file directly. |

## Claude Desktop

| # | Do | Expect |
| - | -- | ------ |
| D1 | Open the tools menu. | `contextlabs` with 5 tools. |
| D2 | Ask: "Propose sources for the Setup section of docs/auth/overview.md." | The AI calls `set_scope` and gets a preview (no elicitation). **It should show you the three-line message and ask you**, not decide itself. |
| D3 | Answer "yes". | The AI calls `set_scope` again with `user_decision` and `preview_token`, and the manifest is written. **Record how natural the exchange reads.** |
| D4 | Before answering another preview, edit the manifest by hand, then answer "yes". | The call is refused as stale, and the AI shows a fresh preview. |
| D5 | Find the prompts (the attach or "+" menu) and run `draft-section` for `token-refresh`. | The prompt text is inserted with the files; the AI drafts and calls `write_section`. **Record where prompts appear and whether completion works.** |
| D6 | Without the prompt, ask the AI to draft the Error codes section. | It calls `get_scope` with `content: true` (it has no file access), then `read_section` for the hash, then `write_section`. |

## Results

Record each run here: date, client and version, the step numbers that passed, and anything that surprised you. Failures and friction also go in the Phase 5 friction log once it exists.

### 2026-09-30, Claude Code v2.1.241 in the Claude desktop app's Code tab

- C4: no form appeared. The client log showed `Elicitation request received in print mode`, and the server got `decline` 4 ms later. In print mode, Claude Code advertises elicitation but declines every request. Fixed by the `--approvals chat` option (DESIGN.md §14.2, §19); the other C steps are to be run in a terminal.

### 2026-09-30, the same client with `--approvals chat`

- D2 and D3 (run in the Code tab): passed. `set_scope` returned a preview and a token, the AI stopped and asked, and after "accept" the second call wrote the manifest (`docs/_error-format.md` added to `context`).
- The AI first read the preview as a failure ("this client isn't getting the server's approval dialog"), because `instructions` only said `set_scope` "asks the user". `instructions` and the preview's `next` now say the preview is the approval step.
- The AI paraphrased the preview, with the resolved sources and context listed, rather than showing the three-line message as written. The paraphrase was accurate, so it's left as is.
