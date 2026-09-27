import { DOCCTX_DIR } from "../manifest/manifest-paths.js";
import { comparePaths } from "../paths/compare-paths.js";

/** Workspace-relative path of the cache; gitignored and always safe to delete (DESIGN.md §12). */
export const CACHE_PATH = `${DOCCTX_DIR}/cache.json`;

/** Bumped whenever the shape changes; a cache from any other version is discarded. */
export const CACHE_FORMAT_VERSION = 1;

/**
 * What the cache knows about one file: its stat when it was hashed, and the hash.
 */
export interface FileFingerprint {
	readonly size: number;
	readonly mtime_ms: number;
	readonly ctime_ms: number;
	readonly ino: number;

	/** Full hex digest with the workspace's `hash_algorithm`. */
	readonly hash: string;

	/** When hashing started, from the injected clock. */
	readonly hashed_at_ms: number;
}

/** `.docctx/cache.json`. Field names are the wire names. */
export interface CacheFile {
	readonly format_version: typeof CACHE_FORMAT_VERSION;
	readonly hash_algorithm: string;
	readonly files: Readonly<Record<string, FileFingerprint>>;
}

/**
 * Reads cache text, or returns `undefined` when it can't be trusted: not JSON, any field of
 * the wrong shape, another format version, or another hash algorithm. The whole file is
 * discarded rather than trusted in part, since a cache only saves work (DESIGN.md §12).
 */
export function parseCacheFile( text: string, algorithm: string ): CacheFile | undefined {

	let parsed: unknown;
	try {
		parsed = JSON.parse( text );
	} catch( error ) {
		if( !( error instanceof SyntaxError ) ) {
			throw error;
		}
		return undefined;
	}
	if(
		!isRecord( parsed ) || parsed[ "format_version" ] !== CACHE_FORMAT_VERSION ||
		parsed[ "hash_algorithm" ] !== algorithm || !isRecord( parsed[ "files" ] )
	) {
		return undefined;
	}

	const files: Record<string, FileFingerprint> = {};
	for( const [ path, entry ] of Object.entries( parsed[ "files" ] ) ) {
		const fingerprint = toFingerprint( entry );
		if( fingerprint === undefined ) {
			return undefined;
		}
		files[ path ] = fingerprint;
	}
	return { "format_version": CACHE_FORMAT_VERSION, "hash_algorithm": algorithm, "files": files };
}

/**
 * Cache text with paths sorted, so the file is stable between saves of the same content.
 */
export function serializeCacheFile( algorithm: string, files: ReadonlyMap<string, FileFingerprint> ): string {

	const sorted: Record<string, FileFingerprint> = {};
	for( const path of [ ...files.keys() ].sort( comparePaths ) ) {
		const entry = files.get( path );
		if( entry !== undefined ) {
			sorted[ path ] = entry;
		}
	}
	const file: CacheFile = {
		"format_version": CACHE_FORMAT_VERSION,
		"hash_algorithm": algorithm,
		"files": sorted
	};
	return `${JSON.stringify( file )}\n`;
}

function toFingerprint( value: unknown ): FileFingerprint | undefined {

	if( !isRecord( value ) ) {
		return undefined;
	}
	const { size, mtime_ms: mtimeMs, ctime_ms: ctimeMs, ino, hash, hashed_at_ms: hashedAtMs } = value;
	if(
		!isCount( size ) || !isFiniteNumber( mtimeMs ) || !isFiniteNumber( ctimeMs ) || !isCount( ino ) ||
		typeof hash !== "string" || !/^[0-9a-f]+$/.test( hash ) || !isFiniteNumber( hashedAtMs )
	) {
		return undefined;
	}
	return {
		"size": size,
		"mtime_ms": mtimeMs,
		"ctime_ms": ctimeMs,
		"ino": ino,
		"hash": hash,
		"hashed_at_ms": hashedAtMs
	};
}

function isRecord( value: unknown ): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray( value );
}

function isFiniteNumber( value: unknown ): value is number {
	return typeof value === "number" && Number.isFinite( value );
}

function isCount( value: unknown ): value is number {
	return isFiniteNumber( value ) && value >= 0;
}
