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

**3. Register the server.** Use absolute paths. Clients don't load your shell profile, so with nvm, `node` must be the full path from `which node`.

Claude Code, from inside `~/docctx-check`:

```bash
claude mcp add contextlabs -- "$(which node)" /path/to/context-lab/dist/cli/main.js serve --workspace ~/docctx-check
```

Claude Desktop: add this to `claude_desktop_config.json` (`~/.config/Claude/` on Linux, `~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows), then restart Claude Desktop:

```json
{
	"mcpServers": {
		"contextlabs": {
			"command": "/absolute/path/to/node",
			"args": [ "/path/to/context-lab/dist/cli/main.js", "serve", "--workspace", "/home/you/docctx-check" ]
		}
	}
}
```

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
