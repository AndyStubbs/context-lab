import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes `text` to `target` by writing a temporary file in the same directory and renaming it
 * over the target, so a crash never leaves the target half-written (DESIGN.md §12).
 *
 * @param target An absolute path that has already been confined to the workspace.
 */
export async function writeFileAtomic( target: string, text: string ): Promise<void> {

	const temporary = path.join(
		path.dirname( target ),
		`.${path.basename( target )}.${process.pid}.${randomUUID()}.tmp`
	);
	try {
		await writeFile( temporary, text, "utf8" );
		await rename( temporary, target );
	} catch( error ) {
		await rm( temporary, { "force": true } );
		throw error;
	}
}
