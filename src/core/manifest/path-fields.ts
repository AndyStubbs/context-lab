import { checkGlobPattern } from "../paths/glob-pattern.js";
import { PathOutsideWorkspaceError } from "../paths/path-outside-workspace-error.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { Located, NodeReader } from "../yaml/node-reader.js";

/**
 * Checks glob patterns read from YAML (DESIGN.md §18). Bad patterns are reported and left
 * out of the result; good ones are returned as written.
 */
export function checkGlobs(
	reader: NodeReader,
	field: string,
	patterns: readonly Located<string>[]
): readonly string[] {

	const valid: string[] = [];
	for( const pattern of patterns ) {
		try {
			checkGlobPattern( pattern.value );
			valid.push( pattern.value );
		} catch( error ) {
			if( !( error instanceof PathOutsideWorkspaceError ) ) {
				throw error;
			}
			reader.report( pattern.node, describeRejection( field, error ) );
		}
	}
	return valid;
}

/**
 * Confines a plain path read from YAML to the workspace, following symlinks (DESIGN.md §18).
 *
 * @returns The normalized workspace-relative path, or `undefined` after reporting a rejection.
 */
export async function confinePath(
	root: WorkspaceRoot,
	reader: NodeReader,
	field: string,
	value: Located<string>
): Promise<string | undefined> {

	try {
		const confined = await root.resolve( value.value );
		return confined.relative;
	} catch( error ) {
		if( !( error instanceof PathOutsideWorkspaceError ) ) {
			throw error;
		}
		reader.report( value.node, describeRejection( field, error ) );
		return undefined;
	}
}

function describeRejection( field: string, error: PathOutsideWorkspaceError ): string {

	const quoted = JSON.stringify( error.path );
	switch( error.reason ) {
		case "invalid":
			if( error.path.startsWith( "!" ) ) {
				return `\`${field}\` can't use \`!\` patterns; list them under \`exclude\`: ${quoted}`;
			}
			return `\`${field}\` has an invalid path: ${quoted}`;
		case "absolute":
			return `\`${field}\` must be relative to the workspace root: ${quoted}`;
		case "escapes-root":
			return `\`${field}\` points outside the workspace: ${quoted}`;
		case "symlink-escape":
			return `\`${field}\` leads outside the workspace through a symlink: ${quoted}`;
	}
}
