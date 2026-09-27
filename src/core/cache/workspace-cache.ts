import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { readTextIfExists } from "../fs/read-text-if-exists.js";
import { writeFileAtomic } from "../fs/write-file-atomic.js";
import { PathOutsideWorkspaceError } from "../paths/path-outside-workspace-error.js";
import type { WorkspaceRoot } from "../paths/workspace-root.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import type { FileFingerprint } from "./cache-file.js";
import { CACHE_PATH, parseCacheFile, serializeCacheFile } from "./cache-file.js";

/** How `save` went. A failed save is never thrown: a cache must not make a command fail. */
export type CacheSaveResult =
	| { readonly status: "saved" | "unchanged" }
	| { readonly status: "failed"; readonly error: unknown };

// A file modified this close to when it was hashed may have changed again within the same
// timestamp tick, so its entry isn't trusted (git's "racy clean" rule). 2 s covers FAT
const RACY_WINDOW_MS = 2000;

// Renames on Windows can fail briefly while another process has the file open
const SAVE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 50;

/**
 * The disposable local cache, `.docctx/cache.json` (DESIGN.md §12). It holds a fingerprint
 * per file so unchanged files aren't rehashed. Deleting it, or finding it corrupt, stale or
 * from another version, never changes a result: every hash is recomputed as needed.
 */
export class WorkspaceCache {

	private readonly m_root: WorkspaceRoot;
	private readonly m_algorithm: string;
	private readonly m_files: Map<string, FileFingerprint>;
	private readonly m_now: () => number;
	private m_isDirty = false;

	private constructor(
		root: WorkspaceRoot,
		algorithm: string,
		files: Map<string, FileFingerprint>,
		now: () => number
	) {

		this.m_root = root;
		this.m_algorithm = algorithm;
		this.m_files = files;
		this.m_now = now;
	}

	/**
	 * Loads the cache, starting empty when `cache.json` is missing, unreadable, invalid, from
	 * another format version or for another hash algorithm. Never throws for any of those.
	 *
	 * @param now The clock, in milliseconds; tests pass their own.
	 */
	static async load(
		root: WorkspaceRoot,
		config: WorkspaceConfig,
		now: () => number = Date.now
	): Promise<WorkspaceCache> {

		const algorithm = config.settings.hash_algorithm;
		const files = new Map<string, FileFingerprint>();
		const text = await readCacheText( root );
		if( text !== undefined ) {
			const parsed = parseCacheFile( text, algorithm );
			for( const [ path, entry ] of Object.entries( parsed?.files ?? {} ) ) {
				files.set( path, entry );
			}
		}
		return new WorkspaceCache( root, algorithm, files, now );
	}

	/** True when there are changes that `save` would write. */
	get isDirty(): boolean {
		return this.m_isDirty;
	}

	/**
	 * The file's full hex hash, reusing the cached one only when the pre-check passes: size,
	 * mtime, ctime and inode unchanged, and the file untouched for 2 s before it was hashed.
	 *
	 * @param path Workspace-relative; confined with `WorkspaceRoot.resolve`.
	 * @returns `undefined` when the file doesn't exist; its entry is dropped.
	 * @throws PathOutsideWorkspaceError when the path isn't confined to the workspace.
	 */
	async hashFile( path: string ): Promise<string | undefined> {

		const confined = await this.m_root.resolve( path );
		let stats: Stats;
		try {
			stats = await stat( confined.absolute );
		} catch( error ) {
			const code = ( error as NodeJS.ErrnoException ).code;
			if( code !== "ENOENT" && code !== "ENOTDIR" ) {
				throw error;
			}
			this.forget( confined.relative );
			return undefined;
		}
		if( !stats.isFile() ) {
			this.forget( confined.relative );
			return undefined;
		}

		const entry = this.m_files.get( confined.relative );
		if( entry !== undefined && isTrusted( entry, stats ) ) {
			return entry.hash;
		}

		// The clock is read before hashing and the stat is the one taken before, so a write
		// during hashing leaves an entry that won't be trusted next time
		const hashedAt = this.m_now();
		const hash = await hashStream( confined.absolute, this.m_algorithm );
		this.m_files.set( confined.relative, {
			"size": stats.size,
			"mtime_ms": stats.mtimeMs,
			"ctime_ms": stats.ctimeMs,
			"ino": stats.ino,
			"hash": hash,
			"hashed_at_ms": hashedAt
		} );
		this.m_isDirty = true;
		return hash;
	}

	/**
	 * Writes the cache atomically if anything changed. The last writer wins; a lost update only
	 * costs a rehash later.
	 */
	async save(): Promise<CacheSaveResult> {

		if( !this.m_isDirty ) {
			return { "status": "unchanged" };
		}
		try {
			const target = ( await this.m_root.resolve( CACHE_PATH ) ).absolute;
			const text = serializeCacheFile( this.m_algorithm, this.m_files );
			for( let attempt = 1; ; attempt++ ) {
				try {
					await writeFileAtomic( target, text );
					break;
				} catch( error ) {
					const code = ( error as NodeJS.ErrnoException ).code;
					if( attempt >= SAVE_ATTEMPTS || ( code !== "EPERM" && code !== "EBUSY" ) ) {
						throw error;
					}
					await delay( RETRY_DELAY_MS * attempt );
				}
			}
			this.m_isDirty = false;
			return { "status": "saved" };
		} catch( error ) {
			return { "status": "failed", "error": error };
		}
	}

	private forget( path: string ): void {

		if( this.m_files.delete( path ) ) {
			this.m_isDirty = true;
		}
	}
}

/**
 * The cache's text, or `undefined` when there is none or it can't be read: a directory in its
 * place, no permission, or a symlink out of the workspace. Any of those just means a rebuild.
 */
async function readCacheText( root: WorkspaceRoot ): Promise<string | undefined> {

	try {
		return await readTextIfExists( ( await root.resolve( CACHE_PATH ) ).absolute );
	} catch( error ) {
		const isFilesystemError = typeof ( error as NodeJS.ErrnoException ).code === "string";
		if( error instanceof PathOutsideWorkspaceError || isFilesystemError ) {
			return undefined;
		}
		throw error;
	}
}

function isTrusted( entry: FileFingerprint, stats: Stats ): boolean {

	return (
		entry.size === stats.size &&
		entry.mtime_ms === stats.mtimeMs &&
		entry.ctime_ms === stats.ctimeMs &&
		entry.ino === stats.ino &&
		stats.mtimeMs < entry.hashed_at_ms - RACY_WINDOW_MS
	);
}

async function hashStream( absolute: string, algorithm: string ): Promise<string> {

	const hash = createHash( algorithm );
	for await ( const chunk of createReadStream( absolute ) ) {
		hash.update( chunk as Buffer );
	}
	return hash.digest( "hex" );
}
