import { randomUUID } from "node:crypto";
import { link, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { readTextIfExists } from "../fs/read-text-if-exists.js";
import { isReservedDocPath } from "../manifest/manifest-paths.js";
import { ReservedDocPathError } from "../manifest/reserved-doc-path-error.js";
import type { ConfinedPath, WorkspaceRoot } from "../paths/workspace-root.js";
import { historyDirFor, parseVersionNumber, versionFileName } from "./history-paths.js";

/** One saved version of a section. */
export interface HistoryVersion {
	readonly number: number;

	/** Workspace-relative path of the version file. */
	readonly path: string;
}

/**
 * Local section history (DESIGN.md §12): the previous content of each section that
 * `write_section` overwrote, one plain file per version, never pruned. It is a safety net
 * only; git is the real history. Only `write_section` saves to it.
 */
export class SectionHistory {

	private readonly m_root: WorkspaceRoot;

	constructor( root: WorkspaceRoot ) {
		this.m_root = root;
	}

	/**
	 * Saves `content` as the section's next version, exactly as given.
	 *
	 * The file is written in full under a temporary name and then hard-linked to its version
	 * name. Linking fails if the name is taken, so concurrent saves never share a number and a
	 * reader never sees a half-written version. (`writeFileAtomic` renames over its target,
	 * which would let two saves overwrite each other.)
	 *
	 * @param doc Workspace-relative doc path; confined with `WorkspaceRoot.resolve`.
	 * @param key Section key, or `undefined` for a doc without sections.
	 * @throws ReservedDocPathError for a doc path that can't be tracked.
	 * @throws PathOutsideWorkspaceError when the doc or the history folder isn't confined.
	 */
	async save( doc: string, key: string | undefined, content: string ): Promise<HistoryVersion> {

		const location = await this.locate( doc, key );
		await mkdir( location.dir.absolute, { "recursive": true } );
		const temporary = path.join( location.dir.absolute, `.${process.pid}.${randomUUID()}.tmp` );
		await writeFile( temporary, content, "utf8" );
		try {
			let version = await this.highest( location ) + 1;
			for( ;; ) {
				const name = versionFileName( version, location.doc );
				try {
					await link( temporary, path.join( location.dir.absolute, name ) );
					return { "number": version, "path": `${location.dir.relative}/${name}` };
				} catch( error ) {
					if( ( error as NodeJS.ErrnoException ).code !== "EEXIST" ) {
						throw error;
					}
					version++;
				}
			}
		} finally {
			await rm( temporary, { "force": true } );
		}
	}

	/** The section's versions, oldest first; empty when it has none. */
	async list( doc: string, key: string | undefined ): Promise<readonly HistoryVersion[]> {

		const location = await this.locate( doc, key );
		return this.versionsIn( location );
	}

	/** The content of one version, or `undefined` when there is no such version. */
	async read( doc: string, key: string | undefined, version: number ): Promise<string | undefined> {

		const location = await this.locate( doc, key );
		const name = versionFileName( version, location.doc );
		return readTextIfExists( path.join( location.dir.absolute, name ) );
	}

	/** The newest version and its content, or `undefined` when the section has none. */
	async latest(
		doc: string,
		key: string | undefined
	): Promise<( HistoryVersion & { readonly content: string } ) | undefined> {

		const location = await this.locate( doc, key );
		const versions = await this.versionsIn( location );
		const newest = versions[ versions.length - 1 ];
		if( newest === undefined ) {
			return undefined;
		}
		const file = path.join( location.dir.absolute, path.posix.basename( newest.path ) );
		const content = await readTextIfExists( file );
		if( content === undefined ) {
			return undefined;
		}
		return { ...newest, "content": content };
	}

	private async locate(
		doc: string,
		key: string | undefined
	): Promise<{ readonly doc: string; readonly dir: ConfinedPath }> {

		const confinedDoc = await this.m_root.resolve( doc );
		if( isReservedDocPath( confinedDoc.relative ) ) {
			throw new ReservedDocPathError( confinedDoc.relative );
		}
		const dir = await this.m_root.resolve( historyDirFor( confinedDoc.relative, key ) );
		return { "doc": confinedDoc.relative, "dir": dir };
	}

	private async versionsIn(
		location: { readonly doc: string; readonly dir: ConfinedPath }
	): Promise<readonly HistoryVersion[]> {

		let entries;
		try {
			entries = await readdir( location.dir.absolute, { "withFileTypes": true } );
		} catch( error ) {
			if( ( error as NodeJS.ErrnoException ).code === "ENOENT" ) {
				return [];
			}
			throw error;
		}

		const versions: HistoryVersion[] = [];
		for( const entry of entries ) {

			// A key can be all digits (a heading "2024"), so a subsection's folder can look like
			// a version file name; only files count
			const version = parseVersionNumber( entry.name, location.doc );
			if( entry.isFile() && version !== undefined ) {
				versions.push( { "number": version, "path": `${location.dir.relative}/${entry.name}` } );
			}
		}
		return versions.sort( ( a, b ) => a.number - b.number );
	}

	private async highest( location: { readonly doc: string; readonly dir: ConfinedPath } ): Promise<number> {

		const versions = await this.versionsIn( location );
		return versions[ versions.length - 1 ]?.number ?? 0;
	}
}
