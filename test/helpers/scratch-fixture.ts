import { cp, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of a fixture workspace in `test/fixtures/`. */
export function fixturePath( name: string ): string {
	return fileURLToPath( new URL( `../fixtures/${name}`, import.meta.url ) );
}

/**
 * Copies a fixture workspace to a temporary directory, so a test can break it. Returns the
 * copy's real path; pass it to `removeScratch` when done.
 */
export async function copyFixture( name: string ): Promise<string> {

	const scratch = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-fixture-" ) ) );
	await cp( fixturePath( name ), scratch, { "recursive": true } );
	return scratch;
}

export async function removeScratch( scratch: string ): Promise<void> {
	await rm( scratch, { "recursive": true, "force": true } );
}
