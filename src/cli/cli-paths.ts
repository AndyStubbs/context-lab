import path from "node:path";
import { PathOutsideWorkspaceError } from "../core/paths/path-outside-workspace-error.js";
import type { WorkspaceRoot } from "../core/paths/workspace-root.js";

/**
 * Turns a path typed on the command line, relative to the current directory as in git, into a
 * workspace-relative path. The result still has to go through `WorkspaceRoot.resolve()`.
 *
 * @param cwd The real path of the current directory, so it compares with the root's real path.
 * @throws PathOutsideWorkspaceError when the path lands outside the workspace.
 */
export function toWorkspacePath( root: WorkspaceRoot, cwd: string, arg: string ): string {

	const relative = path.relative( root.absolute, path.resolve( cwd, arg ) );
	if( relative === "" ) {
		return ".";
	}
	if( relative === ".." || relative.startsWith( `..${path.sep}` ) || path.isAbsolute( relative ) ) {
		throw new PathOutsideWorkspaceError( arg, "escapes-root" );
	}
	return relative.split( path.sep ).join( "/" );
}
