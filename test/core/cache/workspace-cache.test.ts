import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FileFingerprint } from "../../../src/core/cache/cache-file.js";
import { parseCacheFile } from "../../../src/core/cache/cache-file.js";
import { WorkspaceCache } from "../../../src/core/cache/workspace-cache.js";
import { SectionHistory } from "../../../src/core/history/section-history.js";
import { PathOutsideWorkspaceError } from "../../../src/core/paths/path-outside-workspace-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";
import { defaultWorkspaceConfig } from "../../../src/core/workspace/read-workspace-config.js";
import type { WorkspaceConfig } from "../../../src/core/workspace/workspace-config.js";

// A hash no file has, so returning it proves the cached entry was reused
const SENTINEL = "5e5e5e5e";
const HOUR_MS = 3600000;

let m_sandbox: string;
let m_root: WorkspaceRoot;
const m_config: WorkspaceConfig = defaultWorkspaceConfig();

beforeEach( async () => {

	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-cache-" ) ) );
	await mkdir( path.join( m_sandbox, ".docctx" ) );
	m_root = await WorkspaceRoot.open( m_sandbox );
} );

afterEach( async () => {

	await chmod( path.join( m_sandbox, ".docctx" ), 0o755 ).catch( () => undefined );
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

function absolute( relative: string ): string {
	return path.join( m_sandbox, ...relative.split( "/" ) );
}

async function write( relative: string, content: string ): Promise<void> {

	await mkdir( path.dirname( absolute( relative ) ), { "recursive": true } );
	await writeFile( absolute( relative ), content );
}

function sha256( content: string ): string {
	return createHash( "sha256" ).update( content ).digest( "hex" );
}

/** A cache.json entry matching the file's current stat, hashed `hashedAfterMs` after its mtime. */
async function fingerprint( relative: string, hash: string, hashedAfterMs: number ): Promise<FileFingerprint> {

	const stats = await stat( absolute( relative ) );
	return {
		"size": stats.size,
		"mtime_ms": stats.mtimeMs,
		"ctime_ms": stats.ctimeMs,
		"ino": stats.ino,
		"hash": hash,
		"hashed_at_ms": stats.mtimeMs + hashedAfterMs
	};
}

async function writeCache(
	files: Record<string, FileFingerprint>,
	fields: Record<string, unknown> = {}
): Promise<void> {

	const file = { "format_version": 1, "hash_algorithm": "sha256", "files": files, ...fields };
	await writeFile( absolute( ".docctx/cache.json" ), JSON.stringify( file ) );
}

function load( now: () => number = Date.now ): Promise<WorkspaceCache> {
	return WorkspaceCache.load( m_root, m_config, now );
}

describe( "WorkspaceCache", () => {

	it( "hashes a file with the workspace algorithm and marks the cache dirty", async () => {

		await write( "src/a.ts", "export {};\n" );
		const cache = await load();
		expect( cache.isDirty ).toBe( false );
		expect( await cache.hashFile( "src/a.ts" ) ).toBe( sha256( "export {};\n" ) );
		expect( cache.isDirty ).toBe( true );
	} );

	it( "reuses a trusted entry without rehashing", async () => {

		await write( "src/a.ts", "a" );
		await writeCache( { "src/a.ts": await fingerprint( "src/a.ts", SENTINEL, 10000 ) } );
		const cache = await load();
		expect( await cache.hashFile( "src/a.ts" ) ).toBe( SENTINEL );
		expect( cache.isDirty ).toBe( false );
	} );

	it( "rehashes an entry hashed within 2 s of the file's mtime", async () => {

		await write( "src/a.ts", "a" );
		await writeCache( { "src/a.ts": await fingerprint( "src/a.ts", SENTINEL, 1000 ) } );
		expect( await ( await load() ).hashFile( "src/a.ts" ) ).toBe( sha256( "a" ) );
	} );

	it( "trusts an entry hashed more than 2 s after the file's mtime", async () => {

		await write( "src/a.ts", "a" );
		await writeCache( { "src/a.ts": await fingerprint( "src/a.ts", SENTINEL, 2001 ) } );
		expect( await ( await load() ).hashFile( "src/a.ts" ) ).toBe( SENTINEL );
	} );

	it( "records when hashing started, so a racy rehash is rehashed again next time", async () => {

		await write( "src/a.ts", "a" );
		const mtime = ( await stat( absolute( "src/a.ts" ) ) ).mtimeMs;
		const soon = await load( () => mtime + 1500 );
		await soon.hashFile( "src/a.ts" );
		await soon.save();
		const saved = parseCacheFile( await readFile( absolute( ".docctx/cache.json" ), "utf8" ), "sha256" );
		expect( saved?.files[ "src/a.ts" ]?.hashed_at_ms ).toBe( mtime + 1500 );

		const next = await load( () => mtime + 9000 );
		await next.hashFile( "src/a.ts" );
		expect( next.isDirty ).toBe( true );
		await next.save();
		const settled = await load();
		await settled.hashFile( "src/a.ts" );
		expect( settled.isDirty ).toBe( false );
	} );

	it( "always rehashes a file whose mtime is in the future", async () => {

		await write( "src/a.ts", "a" );
		const future = new Date( Date.now() + HOUR_MS );
		await utimes( absolute( "src/a.ts" ), future, future );
		await writeCache( { "src/a.ts": await fingerprint( "src/a.ts", SENTINEL, -HOUR_MS + 1000 ) } );
		const cache = await load();
		expect( await cache.hashFile( "src/a.ts" ) ).toBe( sha256( "a" ) );
	} );

	it( "detects a same-size edit whose mtime was put back, through ctime", async () => {

		await write( "src/a.ts", "aaaa" );
		const old = new Date( Date.now() - HOUR_MS );
		await utimes( absolute( "src/a.ts" ), old, old );
		const first = await load();
		expect( await first.hashFile( "src/a.ts" ) ).toBe( sha256( "aaaa" ) );
		expect( ( await first.save() ).status ).toBe( "saved" );

		await writeFile( absolute( "src/a.ts" ), "bbbb" );
		await utimes( absolute( "src/a.ts" ), old, old );
		const second = await load();
		expect( await second.hashFile( "src/a.ts" ) ).toBe( sha256( "bbbb" ) );
	} );

	it( "returns undefined for a missing file and drops its entry", async () => {

		await write( "src/a.ts", "a" );
		await writeCache( { "src/a.ts": await fingerprint( "src/a.ts", SENTINEL, 10000 ) } );
		await rm( absolute( "src/a.ts" ) );
		const cache = await load();
		expect( await cache.hashFile( "src/a.ts" ) ).toBeUndefined();
		expect( await cache.hashFile( "src/never.ts" ) ).toBeUndefined();
		expect( await cache.hashFile( "src" ) ).toBeUndefined();
		await cache.save();
		const saved = parseCacheFile( await readFile( absolute( ".docctx/cache.json" ), "utf8" ), "sha256" );
		expect( saved?.files ).toEqual( {} );
	} );

	it( "gives the same hashes whatever state cache.json is in", async () => {

		const files = { "src/a.ts": "a", "src/b.ts": "bb", "docs/c.md": "# C\n" };
		for( const [ relative, content ] of Object.entries( files ) ) {
			await write( relative, content );
		}
		const expected = Object.values( files ).map( sha256 );
		async function hashes(): Promise<readonly ( string | undefined )[]> {

			const cache = await load();
			const result = [];
			for( const relative of Object.keys( files ) ) {
				result.push( await cache.hashFile( relative ) );
			}
			await cache.save();
			return result;
		}

		expect( await hashes(), "no cache.json" ).toEqual( expected );
		expect( await hashes(), "warm cache" ).toEqual( expected );
		await writeFile( absolute( ".docctx/cache.json" ), "\u0000garbage{{{" );
		expect( await hashes(), "garbage" ).toEqual( expected );
		const poisoned = { "src/a.ts": await fingerprint( "src/a.ts", SENTINEL, 10000 ) };
		await writeCache( poisoned, { "format_version": 99 } );
		expect( await hashes(), "other version" ).toEqual( expected );
		await writeCache( poisoned, { "hash_algorithm": "sha512" } );
		expect( await hashes(), "other algorithm" ).toEqual( expected );
		await rm( absolute( ".docctx/cache.json" ) );
		await mkdir( absolute( ".docctx/cache.json" ) );
		expect( await hashes(), "a directory in its place" ).toEqual( expected );
	} );

	it( "saves only when something changed", async () => {

		await write( "src/a.ts", "a" );
		const cache = await load();
		expect( await cache.save() ).toEqual( { "status": "unchanged" } );
		await cache.hashFile( "src/a.ts" );
		expect( await cache.save() ).toEqual( { "status": "saved" } );
		expect( cache.isDirty ).toBe( false );
		expect( await cache.save() ).toEqual( { "status": "unchanged" } );
	} );

	it( "reports a failed save instead of throwing", async ( context ) => {

		if( process.platform === "win32" || process.getuid?.() === 0 ) {
			context.skip( "read-only directories don't stop this user from writing" );
		}
		await write( "src/a.ts", "a" );
		const cache = await load();
		await cache.hashFile( "src/a.ts" );
		await chmod( path.join( m_sandbox, ".docctx" ), 0o555 );
		const result = await cache.save();
		expect( result.status ).toBe( "failed" );
		expect( cache.isDirty ).toBe( true );
	} );

	it( "never leaves cache.json unreadable when two writers save at once", async () => {

		const first = await load();
		const second = await load();
		for( let round = 0; round < 50; round++ ) {
			await write( `src/first-${round}.ts`, `first ${round}` );
			await write( `src/second-${round}.ts`, `second ${round}` );
			await first.hashFile( `src/first-${round}.ts` );
			await second.hashFile( `src/second-${round}.ts` );
			const [ a, b ] = await Promise.all( [ first.save(), second.save() ] );
			expect( [ a.status, b.status ] ).toEqual( [ "saved", "saved" ] );
			const text = await readFile( absolute( ".docctx/cache.json" ), "utf8" );
			expect( parseCacheFile( text, "sha256" ), `round ${round}` ).toBeDefined();
		}
	} );

	it( "leaves section history alone when the cache is deleted", async () => {

		const history = new SectionHistory( m_root );
		await history.save( "docs/a.md", "intro", "## Intro\n" );
		await write( "docs/a.md", "## Intro\nnew\n" );
		const cache = await load();
		await cache.hashFile( "docs/a.md" );
		await cache.save();
		await rm( absolute( ".docctx/cache.json" ) );
		expect( await history.list( "docs/a.md", "intro" ) ).toHaveLength( 1 );
		expect( await history.read( "docs/a.md", "intro", 1 ) ).toBe( "## Intro\n" );
	} );

	it( "rejects paths outside the workspace", async () => {

		const cache = await load();
		await expect( cache.hashFile( "../outside.ts" ) ).rejects.toBeInstanceOf( PathOutsideWorkspaceError );
	} );
} );
