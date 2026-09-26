import { isAbsoluteOnAnyPlatform } from "./absolute-path.js";
import { PathOutsideWorkspaceError } from "./path-outside-workspace-error.js";

/**
 * Checks a glob pattern from a manifest lexically: it must be workspace-relative and must not
 * climb out of the root. The files it matches are confined separately when it is expanded.
 *
 * Backslashes are left alone, since they escape glob syntax. A leading `!` is refused
 * because negation belongs in `exclude`, where the explain view can report it.
 *
 * @throws PathOutsideWorkspaceError when the pattern is empty, negated, absolute or has a
 *     `..` segment.
 */
export function checkGlobPattern( pattern: string ): void {

	if( pattern.length === 0 || pattern.includes( "\0" ) || pattern.startsWith( "!" ) ) {
		throw new PathOutsideWorkspaceError( pattern, "invalid" );
	}
	if( isAbsoluteOnAnyPlatform( pattern ) ) {
		throw new PathOutsideWorkspaceError( pattern, "absolute" );
	}
	if( pattern.split( "/" ).includes( ".." ) ) {
		throw new PathOutsideWorkspaceError( pattern, "escapes-root" );
	}
}
