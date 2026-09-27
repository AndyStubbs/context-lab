import path from "node:path";
import { DOCCTX_DIR } from "../manifest/manifest-paths.js";

/** Local section history, gitignored (DESIGN.md §12). */
export const HISTORY_DIR = `${DOCCTX_DIR}/.history`;

/** Stands in for the section key of a doc without sections; slugs never contain `@` (§12). */
export const DOC_KEY = "@doc";

const VERSION_DIGITS = 4;

/**
 * Workspace-relative folder holding the versions of one section:
 * `.docctx/.history/<doc path>/<section key>`. A key with a parent path, such as
 * `setup/install`, nests one folder per segment.
 *
 * @param docPath Normalized workspace-relative doc path, as `WorkspaceRoot.resolve` returns.
 * @param key Section key, or `undefined` for a doc without sections.
 * @throws Error for a key that isn't a section key. Keys come from the outline, so this is a
 *     bug in the caller rather than something a user can cause.
 */
export function historyDirFor( docPath: string, key: string | undefined ): string {

	if( key === undefined ) {
		return `${HISTORY_DIR}/${docPath}/${DOC_KEY}`;
	}
	const segments = key.split( "/" );
	if( key.length === 0 || segments.some( ( segment ) => segment.length === 0 || /[.@\\\0]/.test( segment ) ) ) {
		throw new Error( `Not a section key: ${JSON.stringify( key )}` );
	}
	return `${HISTORY_DIR}/${docPath}/${key}`;
}

/**
 * File name of a version: the number zero-padded to four digits, growing past `9999`, with
 * the doc's own extension so versions open in the right editor mode (`0003.md`).
 */
export function versionFileName( version: number, docPath: string ): string {
	return `${String( version ).padStart( VERSION_DIGITS, "0" )}${extensionOf( docPath )}`;
}

/**
 * The version number a file name holds, or `undefined` for anything that isn't a version file
 * written for this doc, such as a subsection's folder or a stray file.
 */
export function parseVersionNumber( fileName: string, docPath: string ): number | undefined {

	const extension = extensionOf( docPath );
	if( !fileName.endsWith( extension ) ) {
		return undefined;
	}
	const digits = fileName.slice( 0, fileName.length - extension.length );
	if( !/^\d+$/.test( digits ) ) {
		return undefined;
	}
	const version = Number( digits );
	if( version < 1 || versionFileName( version, docPath ) !== fileName ) {
		return undefined;
	}
	return version;
}

function extensionOf( docPath: string ): string {
	return path.posix.extname( path.posix.basename( docPath ) );
}
