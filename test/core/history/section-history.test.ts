import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionHistory } from "../../../src/core/history/section-history.js";
import { ReservedDocPathError } from "../../../src/core/manifest/reserved-doc-path-error.js";
import { PathOutsideWorkspaceError } from "../../../src/core/paths/path-outside-workspace-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";

let m_sandbox: string;
let m_rootDir: string;
let m_history: SectionHistory;

beforeEach( async () => {

	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-history-" ) ) );
	m_rootDir = path.join( m_sandbox, "root" );
	await mkdir( path.join( m_rootDir, ".docctx" ), { "recursive": true } );
	m_history = new SectionHistory( await WorkspaceRoot.open( m_rootDir ) );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

async function numbers( doc: string, key: string | undefined ): Promise<readonly number[]> {
	return ( await m_history.list( doc, key ) ).map( ( version ) => version.number );
}

function historyDir( ...segments: readonly string[] ): string {
	return path.join( m_rootDir, ".docctx", ".history", ...segments );
}

describe( "SectionHistory", () => {

	it( "saves the first version at the §12 path", async () => {

		const version = await m_history.save( "docs/auth/overview.md", "token-refresh", "## Token refresh\n" );
		expect( version ).toEqual( {
			"number": 1,
			"path": ".docctx/.history/docs/auth/overview.md/token-refresh/0001.md"
		} );
		expect( await readFile( historyDir( "docs", "auth", "overview.md", "token-refresh", "0001.md" ), "utf8" ) )
			.toBe( "## Token refresh\n" );
	} );

	it( "numbers versions in order and reads back exactly what was saved", async () => {

		const contents = [ "## A\r\nold\r\n", "## A\nnewer — café ✓\n", "" ];
		for( const content of contents ) {
			await m_history.save( "docs/a.md", "a", content );
		}
		expect( await numbers( "docs/a.md", "a" ) ).toEqual( [ 1, 2, 3 ] );
		for( const [ index, content ] of contents.entries() ) {
			expect( await m_history.read( "docs/a.md", "a", index + 1 ) ).toBe( content );
		}
		expect( await m_history.latest( "docs/a.md", "a" ) ).toEqual( {
			"number": 3,
			"path": ".docctx/.history/docs/a.md/a/0003.md",
			"content": ""
		} );
	} );

	it( "uses @doc and the doc's extension for a doc without sections", async () => {

		const version = await m_history.save( "api/openapi.yaml", undefined, "openapi: 3.1.0\n" );
		expect( version.path ).toBe( ".docctx/.history/api/openapi.yaml/@doc/0001.yaml" );
		expect( await m_history.read( "api/openapi.yaml", undefined, 1 ) ).toBe( "openapi: 3.1.0\n" );
	} );

	it( "keeps a nested key's versions apart from its parent's", async () => {

		await m_history.save( "docs/a.md", "setup", "setup 1" );
		await m_history.save( "docs/a.md", "setup/install", "install 1" );
		await m_history.save( "docs/a.md", "setup", "setup 2" );
		expect( ( await m_history.list( "docs/a.md", "setup" ) ).map( ( version ) => version.path ) ).toEqual( [
			".docctx/.history/docs/a.md/setup/0001.md",
			".docctx/.history/docs/a.md/setup/0002.md"
		] );
		expect( await m_history.list( "docs/a.md", "setup/install" ) ).toHaveLength( 1 );
	} );

	it( "doesn't mistake an all-digit subsection folder for a version", async () => {

		await m_history.save( "docs/README", "releases/2024", "x" );
		await m_history.save( "docs/README", "releases", "y" );
		expect( await numbers( "docs/README", "releases" ) ).toEqual( [ 1 ] );
	} );

	it( "continues after the highest number, skipping gaps and ignoring stray files", async () => {

		const dir = historyDir( "docs", "a.md", "a" );
		await mkdir( dir, { "recursive": true } );
		await writeFile( path.join( dir, "0001.md" ), "1" );
		await writeFile( path.join( dir, "0003.md" ), "3" );
		await writeFile( path.join( dir, "notes.txt" ), "stray" );
		await writeFile( path.join( dir, "0009.txt" ), "wrong extension" );
		expect( ( await m_history.save( "docs/a.md", "a", "4" ) ).number ).toBe( 4 );
		expect( await numbers( "docs/a.md", "a" ) ).toEqual( [ 1, 3, 4 ] );
	} );

	it( "sorts numerically past 9999", async () => {

		const dir = historyDir( "docs", "a.md", "a" );
		await mkdir( dir, { "recursive": true } );
		await writeFile( path.join( dir, "9999.md" ), "9999" );
		expect( await m_history.save( "docs/a.md", "a", "next" ) ).toMatchObject( { "number": 10000 } );
		expect( await numbers( "docs/a.md", "a" ) ).toEqual( [ 9999, 10000 ] );
		expect( ( await m_history.latest( "docs/a.md", "a" ) )?.content ).toBe( "next" );
	} );

	it( "returns nothing for history that doesn't exist", async () => {

		expect( await m_history.list( "docs/a.md", "a" ) ).toEqual( [] );
		expect( await m_history.read( "docs/a.md", "a", 1 ) ).toBeUndefined();
		expect( await m_history.latest( "docs/a.md", "a" ) ).toBeUndefined();
		await m_history.save( "docs/a.md", "a", "1" );
		expect( await m_history.read( "docs/a.md", "a", 2 ) ).toBeUndefined();
	} );

	it( "gives concurrent saves distinct numbers and leaves no temporary files", async () => {

		const count = 20;
		const indexes = Array.from( { "length": count }, ( _unused, index ) => index );
		const saved = await Promise.all(
			indexes.map( async ( index ) => m_history.save( "docs/a.md", "a", `content ${index}` ) )
		);
		const numbers = saved.map( ( version ) => version.number ).sort( ( a, b ) => a - b );
		expect( numbers ).toEqual( Array.from( { "length": count }, ( _unused, index ) => index + 1 ) );
		for( const [ index, version ] of saved.entries() ) {
			expect( await m_history.read( "docs/a.md", "a", version.number ) ).toBe( `content ${index}` );
		}
		expect( ( await readdir( historyDir( "docs", "a.md", "a" ) ) ).filter( ( name ) => name.endsWith( ".tmp" ) ) )
			.toEqual( [] );
	} );

	it( "normalizes the doc path", async () => {

		await m_history.save( "./docs\\a.md", "a", "x" );
		expect( await m_history.list( "docs/a.md", "a" ) ).toHaveLength( 1 );
	} );

	it( "rejects invalid keys, reserved docs and paths outside the workspace", async () => {

		await expect( m_history.save( "docs/a.md", "../x", "x" ) ).rejects.toThrow( "Not a section key" );
		await expect( m_history.save( "workspace", undefined, "x" ) ).rejects.toBeInstanceOf( ReservedDocPathError );
		await expect( m_history.save( "../outside.md", "a", "x" ) ).rejects.toBeInstanceOf( PathOutsideWorkspaceError );
	} );

	it( "refuses a symlinked .history that leads outside the workspace", async () => {

		const outside = path.join( m_sandbox, "outside" );
		await mkdir( outside );
		if( process.platform === "win32" ) {
			await symlink( outside, historyDir(), "junction" );
		} else {
			await symlink( outside, historyDir(), "dir" );
		}
		await expect( m_history.save( "docs/a.md", "a", "x" ) ).rejects.toBeInstanceOf( PathOutsideWorkspaceError );
		expect( await readdir( outside ) ).toEqual( [] );
	} );
} );
