import { readFile } from "node:fs/promises";

/**
 * Reads a UTF-8 file, or returns `undefined` when it doesn't exist.
 *
 * @param target An absolute path that has already been confined to the workspace.
 */
export async function readTextIfExists( target: string ): Promise<string | undefined> {

	try {
		return await readFile( target, "utf8" );
	} catch( error ) {
		if( ( error as NodeJS.ErrnoException ).code === "ENOENT" ) {
			return undefined;
		}
		throw error;
	}
}
