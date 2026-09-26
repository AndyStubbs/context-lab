import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PathRejectionReason } from "../../../src/core/paths/path-outside-workspace-error.js";
import { PathOutsideWorkspaceError } from "../../../src/core/paths/path-outside-workspace-error.js";
import { WorkspaceRoot } from "../../../src/core/paths/workspace-root.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/basic", import.meta.url ) );

let m_sandbox: string;
let m_rootDir: string;
let m_outsideDir: string;

beforeEach( async () => {

	// Sandbox layout: <sandbox>/root is the workspace, <sandbox>/outside is not
	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-root-" ) ) );
	m_rootDir = path.join( m_sandbox, "root" );
	m_outsideDir = path.join( m_sandbox, "outside" );
	await mkdir( path.join( m_rootDir, "docs", "auth" ), { "recursive": true } );
	await mkdir( path.join( m_rootDir, "src" ), { "recursive": true } );
	await mkdir( m_outsideDir, { "recursive": true } );
	await writeFile( path.join( m_rootDir, "docs", "auth", "overview.md" ), "# Overview\n" );
	await writeFile( path.join( m_rootDir, "src", "a.ts" ), "export {};\n" );
	await writeFile( path.join( m_outsideDir, "secret.txt" ), "secret\n" );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

describe( "WorkspaceRoot.resolve", () => {

	describe( "accepts paths inside the root", () => {

		it( "resolves a nested relative path", async () => {

			const root = await WorkspaceRoot.open( m_rootDir );
			const resolved = await root.resolve( "docs/auth/overview.md" );
			expect( resolved.relative ).toBe( "docs/auth/overview.md" );
			expect( resolved.absolute ).toBe( path.join( m_rootDir, "docs", "auth", "overview.md" ) );
		} );

		it( "normalizes ./, internal .. and trailing slashes", async () => {

			const root = await WorkspaceRoot.open( m_rootDir );
			expect( ( await root.resolve( "./src/a.ts" ) ).relative ).toBe( "src/a.ts" );
			expect( ( await root.resolve( "docs/../src/a.ts" ) ).relative ).toBe( "src/a.ts" );
			expect( ( await root.resolve( "docs/auth/" ) ).relative ).toBe( "docs/auth" );
			expect( ( await root.resolve( "." ) ).relative ).toBe( "." );
		} );

		it( "treats backslashes as separators and returns forward slashes", async () => {

			const root = await WorkspaceRoot.open( m_rootDir );
			const resolved = await root.resolve( "docs\\auth\\overview.md" );
			expect( resolved.relative ).toBe( "docs/auth/overview.md" );
			expect( resolved.absolute ).toBe( path.join( m_rootDir, "docs", "auth", "overview.md" ) );
		} );

		it( "accepts a target that doesn't exist yet", async () => {

			const root = await WorkspaceRoot.open( m_rootDir );
			const resolved = await root.resolve( ".docctx/docs/auth/overview.md.yaml" );
			expect( resolved.relative ).toBe( ".docctx/docs/auth/overview.md.yaml" );
			expect( resolved.absolute ).toBe(
				path.join( m_rootDir, ".docctx", "docs", "auth", "overview.md.yaml" )
			);
		} );

		it( "accepts a file whose name starts with two dots", async () => {

			const root = await WorkspaceRoot.open( m_rootDir );
			expect( ( await root.resolve( "..notes.md" ) ).relative ).toBe( "..notes.md" );
		} );

		it( "resolves a doc in the fixture workspace", async () => {

			const root = await WorkspaceRoot.open( FIXTURE_ROOT );
			const resolved = await root.resolve( "docs/auth/overview.md" );
			expect( resolved.relative ).toBe( "docs/auth/overview.md" );
			expect( resolved.absolute ).toBe(
				path.join( await realpath( FIXTURE_ROOT ), "docs", "auth", "overview.md" )
			);
		} );
	} );

	describe( "rejects invalid and absolute paths", () => {

		it.each( [ "", "docs/\0.md" ] )( "rejects %j as invalid", async ( input ) => {

			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( input ), "invalid" );
		} );

		it.each( [
			"/etc/passwd",
			"C:\\Windows\\system.ini",
			"C:/Windows",
			"C:relative",
			"\\\\server\\share\\file",
			"//server/share/file"
		] )( "rejects %j as absolute", async ( input ) => {

			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( input ), "absolute" );
		} );

		it( "rejects an absolute path even when it points inside the root", async () => {

			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( path.join( m_rootDir, "src", "a.ts" ) ), "absolute" );
		} );
	} );

	describe( "rejects .. escapes", () => {

		it.each( [
			"..",
			"../outside/secret.txt",
			"docs/../../outside/secret.txt",
			"docs/auth/../../..",
			"..\\outside\\secret.txt",
			"../root-sibling"
		] )( "rejects %j", async ( input ) => {

			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( input ), "escapes-root" );
		} );
	} );

	describe( "symlinks", () => {

		it( "rejects a symlinked directory that points outside the root", async () => {

			await linkDirectory( m_outsideDir, path.join( m_rootDir, "docs", "linked" ) );
			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( "docs/linked/secret.txt" ), "symlink-escape" );
			await expectRejection( root.resolve( "docs/linked" ), "symlink-escape" );
		} );

		it( "rejects a new file under a symlinked directory that points outside", async () => {

			await linkDirectory( m_outsideDir, path.join( m_rootDir, "docs", "linked" ) );
			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( "docs/linked/new/file.md" ), "symlink-escape" );
		} );

		it( "rejects a symlinked file that points outside the root", async ( context ) => {

			const created = await tryLinkFile(
				path.join( m_outsideDir, "secret.txt" ),
				path.join( m_rootDir, "docs", "secret.txt" )
			);
			if( !created ) {
				context.skip( "file symlinks need extra privileges on this system" );
			}
			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( "docs/secret.txt" ), "symlink-escape" );
		} );

		it( "accepts a symlink that points to another file inside the root", async ( context ) => {

			const created = await tryLinkFile(
				path.join( m_rootDir, "src", "a.ts" ),
				path.join( m_rootDir, "docs", "a-link.ts" )
			);
			if( !created ) {
				context.skip( "file symlinks need extra privileges on this system" );
			}
			const root = await WorkspaceRoot.open( m_rootDir );
			const resolved = await root.resolve( "docs/a-link.ts" );
			expect( resolved.relative ).toBe( "docs/a-link.ts" );
			expect( resolved.absolute ).toBe( path.join( m_rootDir, "src", "a.ts" ) );
		} );

		it( "rejects a dangling symlink, since writing through it could land anywhere", async ( context ) => {

			const created = await tryLinkFile(
				path.join( m_outsideDir, "missing.txt" ),
				path.join( m_rootDir, "docs", "dangling.txt" )
			);
			if( !created ) {
				context.skip( "file symlinks need extra privileges on this system" );
			}
			const root = await WorkspaceRoot.open( m_rootDir );
			await expectRejection( root.resolve( "docs/dangling.txt" ), "symlink-escape" );
		} );

		it( "works when the root itself is opened through a symlink", async () => {

			const alias = path.join( m_sandbox, "alias" );
			await linkDirectory( m_rootDir, alias );
			const root = await WorkspaceRoot.open( alias );
			expect( root.absolute ).toBe( m_rootDir );
			const resolved = await root.resolve( "src/a.ts" );
			expect( resolved.absolute ).toBe( path.join( m_rootDir, "src", "a.ts" ) );
			await expectRejection( root.resolve( "../outside/secret.txt" ), "escapes-root" );
		} );
	} );
} );

async function expectRejection(
	promise: Promise<unknown>,
	reason: PathRejectionReason
): Promise<void> {

	const error: unknown = await promise.then(
		() => undefined,
		( caught: unknown ) => caught
	);
	expect( error ).toBeInstanceOf( PathOutsideWorkspaceError );
	if( error instanceof PathOutsideWorkspaceError ) {
		expect( error.reason ).toBe( reason );
	}
}

/** Directory links use junctions on Windows, which need no extra privileges. */
async function linkDirectory( target: string, linkPath: string ): Promise<void> {

	if( process.platform === "win32" ) {
		await symlink( target, linkPath, "junction" );
	} else {
		await symlink( target, linkPath, "dir" );
	}
}

/** Returns false when the OS refuses to create file symlinks (Windows without privileges). */
async function tryLinkFile( target: string, linkPath: string ): Promise<boolean> {

	try {
		await symlink( target, linkPath, "file" );
		return true;
	} catch( error ) {
		if( error instanceof Error && "code" in error && error.code === "EPERM" ) {
			return false;
		}
		throw error;
	}
}
