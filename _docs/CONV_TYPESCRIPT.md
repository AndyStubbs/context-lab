# TypeScript Coding Conventions

Conventions for the ContextLabs TypeScript code: the core library, the `docctx` CLI, the MCP server and, later, the Claude Code plugin's hook scripts. The architecture and specs are in [`DESIGN.md`](DESIGN.md). Prefer idiomatic modern TypeScript on Node 22+, with the house-style overrides below (tabs, semicolons, spacing, naming prefixes, no ternaries).

## Required

- Use **TypeScript** with `strict` compiler options (see Strictness below).
- Use **tabs** for all indentation (not spaces).
- **Semicolons are required** on every statement that expects one, including declarations, calls, returns, `throw` and `export` statements. Do not rely on ASI.
- Target **Node 22+** and write **ES modules** (`"type": "module"`, `module` / `moduleResolution` set to `NodeNext`). Relative imports include the `.js` extension, as NodeNext requires.
- Import Node built-ins with the `node:` prefix (`node:fs/promises`, `node:path`, `node:crypto`).

## General Principles

- **One primary export per file** when practical. The file name matches the export in kebab-case (`scope-resolver.ts` → `ScopeResolver` or `resolveScope`).
- **Core is independent of adapters.** `core/` must never import the MCP SDK, CLI argument parsing, or anything from `mcp/` or `cli/`. The adapters call core, and core never calls them (DESIGN.md §6).
- **Thin adapters.** MCP handlers and CLI commands parse input, call one core function, and format the result. Scope resolution, section parsing, hashing and staleness logic belong in core, not in the adapters.
- **Deterministic core.** No network access, no LLM or API calls, no telemetry (DESIGN.md §5, §18). Pass time, randomness and the workspace root in as parameters when a test needs to control them.
- **Immutability.** Prefer `readonly` fields and `readonly` arrays. Scope resolution builds new objects rather than mutating the parsed manifest or workspace config.
- **Async.** Use `async`/`await` with `node:fs/promises` for file I/O.

## Strictness

Enable and keep these (or stricter) in `tsconfig.json`:

- `strict: true` (implies strict null checks, etc.)
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`
- `noUncheckedIndexedAccess`: treat indexed access as possibly `undefined`
- `exactOptionalPropertyTypes`: this matters for manifests, where an absent field and a field set to `undefined` must not be confused during merging

Do not use `any` except at a deliberate boundary (for example, raw parsed YAML, the parsed cache file, or MCP request arguments) and narrow it immediately. Prefer `unknown` over `any`. Avoid non-null assertions (`!`) unless the invariant is locally obvious and commented.

## General Formatting

### Character limit

- Keep lines under **100** characters. Wrap only rarely, and never beyond **120**.
- Only wrap lines that exceed 100 characters.
- When wrapping an `if` / `while` / `for` condition or a function signature over 100 characters, keep conditions in logical groups and put the final `) {` on its own line.

**Examples:**
```typescript
// ✓ Good
if(
	!manifest.doc || !manifest.type ||
	!manifest.status || !isKnownType( workspace, manifest.type )
) {
	// ...
}

// ✗ Bad
if( !manifest.doc || !manifest.type
	|| !manifest.status || !isKnownType( workspace, manifest.type ) ) {
	// ...
}
```

### Indentation

- Use **tabs** for indentation (not spaces).
- EditorConfig should enforce `indent_style = tab` for `.ts`, `.js` and `.json` files.
- YAML files are the exception: YAML forbids tabs, so manifests, `workspace.yaml` and YAML fixtures use two-space indentation.

### Semicolons

- Always terminate statements with `;`.
- Do not omit semicolons after class field initializers.

**Examples:**
```typescript
// ✓ Good
const MAX_CONTEXT_BYTES = 200000;
private readonly m_db: Database;
m_cache.clear();

// ✗ Bad
const MAX_CONTEXT_BYTES = 200000
m_cache.clear()
```

### Braces (K&R)

- Place the opening `{` on the **same line** as the header for functions, classes, control flow and object literals (`) {` / `] {` / `else {`).
- Always use braces for `if` / `else` / `for` / `while` / `do`, even for single-statement bodies.
- In non-trivial method or constructor bodies, put a **blank line** after the opening `{`, before the first statement.

**Examples:**
```typescript
// ✓ Good
if( condition ) {
	doSomething();
} else {
	doSomethingElse();
}

export class SectionHistory {

	private readonly m_root: string;

	constructor( root: string ) {

		this.m_root = root;
	}
}

// ✗ Bad (Allman braces)
if( condition )
{
	doSomething();
}
```

### String Literals

- Use **double quotes** (`"`) for all regular strings.
- Use **backticks** (`` ` ``) only for template literals with interpolation.
- Never use single quotes (`'`) in TypeScript.

**Examples:**
```typescript
// ✓ Good
const manifestDir = ".docctx";
const historyPath = `.history/${docPath}/${slug}/${version}.md`;

// ✗ Bad
const manifestDir = '.docctx';
const historyPath = ".history/" + docPath + "/" + slug + "/" + version + ".md";
```

### Spacing and Parentheses

#### Function Calls, Declarations, and Collections

- Add spaces **inside** parentheses for calls and declarations.
- Add spaces inside brackets for indexers when an expression is present.
- Add spaces inside braces for non-empty object and array literals.
- Trailing commas are fine in multi-line literals and parameter lists.

**Examples:**
```typescript
// ✓ Good
resolveScope( workspace, manifest, sectionSlug );
function hashFile( path: string, algorithm: string ): Promise<string> {
}

const statuses = [ "draft", "review", "published", "deprecated" ];
const entry = { "file_path": path, "role": "source" };
const section = sections[ index ];

// ✗ Bad
resolveScope(workspace, manifest, sectionSlug);
const statuses = ["draft", "review"];
const section = sections[index];
```

#### Control Statements

- **No space** before `(` in `if`, `while`, `for`, `switch` and `catch`.
- Spaces **inside** the parentheses.
- A space after `)` before `{`.

**Examples:**
```typescript
// ✓ Good
if( condition ) {
	// code
}

for( const pattern of manifest.exclude ) {
	excluded.add( pattern );
}

// ✗ Bad
if (condition) {
	// code
}
```

### Object Properties

- **Always quote** property names in object literals that mirror an external format, even when TypeScript doesn't require it. For this project, that means MCP tool results and elicitation requests, objects written to `cache.json`, and objects written out as manifest, lock file or workspace YAML.
- Use double quotes for those property names.
- Interface and type members that map 1:1 to an external format keep the wire names. Manifest, lock file and cache fields are `snake_case` (`implements_into`, `max_context_bytes`, `hash_algorithm`), so the TypeScript types use those names too rather than camelCase copies.

**Examples:**
```typescript
// ✓ Good
const row = {
	"doc_id": docId,
	"file_path": filePath,
	"role": "source",
	"reason": "sections.token-refresh.sources"
};

// ✗ Bad
const row = {
	docId: docId,
	filePath: filePath
};
```

### Conditional Expressions

- **No ternary operators.** Use explicit `if` / `else`.
- Prefer `switch` or discriminated unions over long `if`–`else if` chains when matching a closed set of cases (doc types, scope roles, staleness states).
- Keep conditional logic clear and readable.

**Examples:**
```typescript
// ✓ Good
let state: SectionState;
if( verification === undefined ) {
	state = "unverified";
} else {
	state = "verified";
}

// ✗ Bad
const state = verification === undefined ? "unverified" : "verified";
```

### Types and Annotations

- Annotate public API surfaces: exported functions and public methods.
- Prefer `interface` for object shapes shared across modules. Use `type` for unions, intersections, mapped types and aliases.
- Prefer `readonly` arrays (`readonly T[]` or `ReadonlyArray<T>`) for inputs that must not be mutated.
- Use `as const` for fixed literal tuples and maps when it improves inference.
- Do not use `enum`. Prefer string union types (`type ScopeRole = "source" | "context";`).

## Project Structure

### Layout

Mirror the layers in DESIGN.md §6. Exact folder names are fixed during scaffolding.

- `src/core/`: manifest and workspace reading and writing, scope resolution, sections and slugs, hashing, verification records and lock files, staleness, the local cache and section history. Must not depend on MCP or the CLI.
- `src/cli/`: `docctx` commands. Argument parsing and output formatting only.
- `src/mcp/`: the MCP server, tools, elicitation and prompts. Registration and formatting only.
- `plugin/` (Milestone 4): the Claude Code skill and hook scripts.

Keep modules cohesive. Do not create a catch-all `utils/` for code that belongs to a specific core area.

### MCP server

- **Never write to stdout** in the MCP server except through the SDK's transport. stdout carries JSON-RPC over stdio, and a stray `console.log` corrupts the protocol. Log to stderr.
- Keep the tool list to the set in DESIGN.md §14.1. Adding a tool is a design change, not an implementation detail.
- Tool descriptions are one or two sentences. Tool output is compact and structured, and returns slices (an outline or one section), not whole files.
- Report expected failures (unknown doc, orphaned section, path outside the workspace) as tool results with `isError: true` and a short message the model can act on. Do not throw them.
- Validate tool and prompt arguments at the boundary (for example, with the SDK's schema support) before calling core.
- Tools that need a user decision (`set_scope`, `confirm_section`) ask through elicitation when the client supports it and act only on the user's answer. When it does, reject any answer the model passes in as an argument (DESIGN.md §14.2).
- Return file and doc text as data. Never add framing that could be read as instructions to the model (DESIGN.md §18).

### CLI

- Use exit codes consistently: `0` for success, non-zero for failures and for failing checks (`docctx check --stale --fail-on published`).
- Write results to stdout and diagnostics to stderr, so CI and scripts can parse the output.

### Files and paths

- Every path from a manifest, tool argument or CLI argument goes through a single core confinement helper. That helper resolves the path against the workspace root, follows symlinks, and rejects anything outside the root. Do not call `fs` with an unchecked path.
- Store and compare paths as workspace-relative with forward slashes, whatever the OS.
- Writing to a tracked doc happens only through `write_section` (and `confirm_section` applying a fix, which uses the same path). It saves the previous content to `.docctx/.history/` first.
- Write the cache and history files atomically: write a temporary file in the same directory, then rename it over the target.

### YAML

- Read and write manifests with the `yaml` package's `Document` API, not `parse` / `stringify`, whenever a file may be written back. This preserves comments and formatting in hand-edited files.
- Validation errors carry the manifest path plus a line and column, taken from the YAML node's source range (DESIGN.md §21).
- Lock files are generated, not hand-edited. Write them in full with sorted keys so their diffs stay minimal (DESIGN.md §13).

### Cache

- `cache.json` is disposable (DESIGN.md §12). Code must give the same results when it is missing, stale, corrupt or from another format version, and must rebuild it rather than fail.
- Never put anything in the cache that can't be rebuilt from committed files and the docs. Verification data belongs in manifests and lock files.
- Access the cache only through its core interface, so the storage can change without touching callers.

### Errors

- Core throws or returns typed errors (for example, `ManifestError`, `PathOutsideWorkspaceError`) that carry the file path and, where known, the line. Adapters decide how to present them.
- Never swallow errors silently. Orphaned sections and manifests are reported, never dropped (DESIGN.md §10, §16).

## Code Organization

### File structure (class)

1. Imports
2. Type and interface declarations local to the file (if any)
3. Class: fields (`m_`) → constructor → public API → private helpers

### File structure (function module)

1. Imports
2. Module-level constants and `m_` state (rare)
3. Exported functions
4. Internal helpers

### Comments and Documentation

#### File and public API docs

- Include a short JSDoc comment on exported classes and public functions.
- Document non-obvious parameters and return values. Do not narrate the signature.

**Type Example:**
```typescript
/**
 * Resolves the files in scope for a doc or section, with the reason each file is included.
 */
export class ScopeResolver {
}
```

**Method Example:**
```typescript
/**
 * Computes the resolved scope using the merge order in DESIGN.md §9.
 *
 * @param sectionSlug Omit for the whole-doc scope.
 * @returns Entries sorted by path, with excludes already applied.
 */
resolve( manifest: DocManifest, sectionSlug?: string ): readonly ScopeEntry[] {

	// implementation
	return [];
}
```

#### Inline Comments

- Place comments **above** code, not after code on the same line.
- Always include an empty line before a comment.
- Keep comments concise. Explain intent, not the obvious.

**Examples:**
```typescript
// ✓ Good
const entries = expandGlobs( patterns, root );

// Exclude always wins, so it is applied after every merge step
const scoped = entries.filter( ( entry ) => !isExcluded( entry, excludes ) );

// ✗ Bad
const entries = expandGlobs( patterns, root ); // expand
const scoped = entries.filter( ( entry ) => !isExcluded( entry, excludes ) ); // apply excludes
```

## Naming Conventions

### Files

- **kebab-case** file names: `scope-resolver.ts`, `section-parser.ts`, `set-scope.ts`.
- Name MCP tool and prompt modules after the name they register (`set-scope.ts` registers `set_scope`, `draft-section.ts` registers `draft-section`).

### Types and members

- **PascalCase** for classes, interfaces and types.
- **camelCase** for parameters, locals and methods.
- Prefix instance fields with `m_` (member): `m_db`, `m_root`.
- Prefix module-scoped non-exported state with `m_` in function modules.
- Do **not** use `_` or `#` private fields as the primary style. Use TypeScript `private` plus `m_`.
- Boolean names read as predicates: `isStale`, `hasSections`, `canApply`.
- Avoid abbreviations unless they are standard (`Id`, `Url`, `Yaml`).
- Fields that mirror manifest, lock file or cache keys keep their `snake_case` wire names (see Object Properties).

**Examples:**
```typescript
export class LockFile {

	private readonly m_sections: ReadonlyMap<string, LockEntry>;

	constructor( sections: ReadonlyMap<string, LockEntry> ) {

		this.m_sections = sections;
	}

	hashFor( slug: string, path: string ): string | undefined {

		const entry = this.m_sections.get( slug );
		if( entry === undefined ) {
			return undefined;
		}
		return entry.hashes.get( path );
	}
}
```

### Constants

- Use `UPPER_CASE` for module- or file-scoped primitive constants that never change (`MANIFEST_DIR`, `DEFAULT_HASH_ALGORITHM`).
- Do not use `UPPER_CASE` for temporary calculation variables.

### Variables

- Use `const` when the binding is not reassigned.
- Use `let` when the binding is reassigned.
- Do not use `var`.

## Tooling

- Formatting is enforced with ESLint and `@stylistic` rules rather than Prettier, because Prettier cannot express this house style (spaces inside parentheses, no space after `if`).
- Tests use Vitest, with snapshot tests for golden files such as the explain view (DESIGN.md §20). The linter is ESLint (ROADMAP.md Phase 0). Record the commands in `CLAUDE.md` once they exist.

## What to Avoid

- Importing the MCP SDK or CLI code into `core/`
- Anything that makes network requests or calls a model API
- `console.log` in the MCP server
- Unconfined file paths
- `yaml` `parse` / `stringify` round-trips on files the user may have edited
- Adding MCP tools, or lengthening tool descriptions, without a design change
- Modifying tracked docs outside `write_section`, or adding metadata to them
- Editing manifests or lock files from anywhere but the core writers, or storing non-rebuildable data in `cache.json`
- Ternaries, ASI-dependent code, space-indented TypeScript
- Single-quoted strings
- `enum`, `any`, unchecked `!`, and sweeping `eslint-disable` / `@ts-ignore` without a documented reason

## Related docs

- [`DESIGN.md`](DESIGN.md): architecture, file formats, MCP interface and milestones
