import { mkdir } from "node:fs/promises";
import { readTextIfExists } from "../fs/read-text-if-exists.js";
import { writeFileAtomic } from "../fs/write-file-atomic.js";
import { DOCCTX_DIR, WORKSPACE_CONFIG_PATH } from "../manifest/manifest-paths.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";

/** What `initWorkspace` did to one file. */
export interface InitChange {

	/** Workspace-relative path. */
	readonly path: string;
	readonly change: "created" | "updated" | "unchanged";
}

/**
 * The `workspace.yaml` that `docctx init` writes. Only `version` is active, so it parses to the
 * same config as having no file; the commented examples are the DESIGN.md §8 values.
 */
export const WORKSPACE_TEMPLATE = `# ContextLabs workspace config (DESIGN.md §8). Only \`version\` is required;
# uncomment a section to change its defaults.
version: 1

# Context every doc gets, and files that are never in scope.
# defaults:
#   context:
#     - docs/_style.md
#     - docs/_glossary.md
#   exclude:
#     - "**/node_modules/**"

# Doc types and their lifecycles. Defining any type replaces all three defaults.
# types:
#   reference:
#     statuses: [draft, review, published, deprecated]
#   guide:
#     statuses: [draft, review, published, deprecated]
#   plan:
#     statuses: [draft, proposed, decided, superseded]
#     exclude_from_context_when: [superseded]

# Terms the terminology check reports, and the word to use instead.
# glossary:
#   file: docs/_glossary.md
#   banned_terms:
#     - term: "whitelist"
#       prefer: "allowlist"

# Hashing, and the size limits for loading context and change summaries.
# settings:
#   hash_algorithm: sha256
#   max_context_bytes: 200000
#   max_diff_bytes: 20000
`;

// Local files that must stay out of git (DESIGN.md §12)
const GITIGNORE_LINES = [ `${DOCCTX_DIR}/cache.json`, `${DOCCTX_DIR}/.history/` ];

// Lock files hold only hashes, so review tools should collapse them (DESIGN.md §7)
const GITATTRIBUTES_LINES = [ `${DOCCTX_DIR}/**/*.lock linguist-generated` ];

/**
 * Sets up a workspace (DESIGN.md §7): writes `.docctx/workspace.yaml` unless it exists, and
 * adds any missing lines to `.gitignore` and `.gitattributes`, creating them if needed. Other
 * lines are left as they are, so running it again is safe.
 *
 * @param root The folder to turn into a workspace.
 */
export async function initWorkspace( root: WorkspaceRoot ): Promise<readonly InitChange[]> {

	const config = await root.resolve( WORKSPACE_CONFIG_PATH );
	let configChange: InitChange[ "change" ] = "unchanged";
	if( await readTextIfExists( config.absolute ) === undefined ) {
		await mkdir( ( await root.resolve( DOCCTX_DIR ) ).absolute, { "recursive": true } );
		await writeFileAtomic( config.absolute, WORKSPACE_TEMPLATE );
		configChange = "created";
	}

	return [
		{ "path": WORKSPACE_CONFIG_PATH, "change": configChange },
		{ "path": ".gitignore", "change": await ensureLines( root, ".gitignore", GITIGNORE_LINES ) },
		{ "path": ".gitattributes", "change": await ensureLines( root, ".gitattributes", GITATTRIBUTES_LINES ) }
	];
}

/**
 * Appends the lines a file is missing, matching whole lines with surrounding spaces ignored.
 * Keeps the file's line endings.
 */
async function ensureLines(
	root: WorkspaceRoot,
	file: string,
	lines: readonly string[]
): Promise<InitChange[ "change" ]> {

	const confined = await root.resolve( file );
	const current = await readTextIfExists( confined.absolute );
	if( current === undefined ) {
		await writeFileAtomic( confined.absolute, `${lines.join( "\n" )}\n` );
		return "created";
	}

	const present = new Set( current.split( /\r?\n/ ).map( ( line ) => line.trim() ) );
	const missing = lines.filter( ( line ) => !present.has( line ) );
	if( missing.length === 0 ) {
		return "unchanged";
	}

	let eol = "\n";
	if( current.includes( "\r\n" ) ) {
		eol = "\r\n";
	}
	let text = current;
	if( text.length > 0 && !text.endsWith( "\n" ) ) {
		text += eol;
	}
	await writeFileAtomic( confined.absolute, `${text}${missing.join( eol )}${eol}` );
	return "updated";
}
