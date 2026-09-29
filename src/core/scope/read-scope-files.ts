import { readFile } from "node:fs/promises";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { ResolvedScope, ScopeRole } from "./resolved-scope.js";

/** The contents of one file in a resolved scope. */
export interface ScopeFile {
	readonly path: string;
	readonly role: ScopeRole;
	readonly sizeBytes: number;

	/** The whole file as UTF-8; absent for a binary file, which has no useful text. */
	readonly text?: string;
}

/**
 * Reads every file in a resolved scope in full, sources first. Files are never truncated
 * (DESIGN.md §14.1): callers check the scope against `max_context_bytes` first.
 */
export async function readScopeFiles( root: WorkspaceRoot, scope: ResolvedScope ): Promise<readonly ScopeFile[]> {

	const files: ScopeFile[] = [];
	for( const entry of [ ...scope.sources, ...scope.context ] ) {
		const confined = await root.resolve( entry.path );
		const bytes = await readFile( confined.absolute );
		const file: { -readonly [ K in keyof ScopeFile ]: ScopeFile[ K ] } = {
			"path": entry.path,
			"role": entry.role,
			"sizeBytes": bytes.length
		};

		// A NUL byte is the usual sign of a binary file, as in git
		if( !bytes.includes( 0 ) ) {
			file.text = bytes.toString( "utf8" );
		}
		files.push( file );
	}
	return files;
}
