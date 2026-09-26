import { stat } from "node:fs/promises";
import path from "node:path";
import { DOCCTX_DIR } from "../manifest/manifest-paths.js";
import { WorkspaceRoot } from "../paths/workspace-root.js";
import { WorkspaceNotFoundError } from "./workspace-not-found-error.js";

/**
 * Finds the workspace containing `startDir`: the nearest directory, starting at `startDir`
 * and walking up, that has a `.docctx/` directory (DESIGN.md §7).
 *
 * @throws WorkspaceNotFoundError when the filesystem root is reached without finding one.
 */
export async function locateWorkspace( startDir: string ): Promise<WorkspaceRoot> {

	const start = path.resolve( startDir );
	let current = start;
	for( ;; ) {
		if( await isDirectory( path.join( current, DOCCTX_DIR ) ) ) {
			return WorkspaceRoot.open( current );
		}
		const parent = path.dirname( current );
		if( parent === current ) {
			throw new WorkspaceNotFoundError( start );
		}
		current = parent;
	}
}

async function isDirectory( target: string ): Promise<boolean> {

	try {
		const stats = await stat( target );
		return stats.isDirectory();
	} catch( error ) {
		const code = ( error as NodeJS.ErrnoException ).code;
		if( code === "ENOENT" || code === "ENOTDIR" ) {
			return false;
		}
		throw error;
	}
}
