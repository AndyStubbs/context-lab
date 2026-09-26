import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locateWorkspace } from "../../../src/core/workspace/locate-workspace.js";
import { WorkspaceNotFoundError } from "../../../src/core/workspace/workspace-not-found-error.js";

const FIXTURE_ROOT = fileURLToPath( new URL( "../../fixtures/basic", import.meta.url ) );

let m_sandbox: string;

beforeEach( async () => {
	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-locate-" ) ) );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

describe( "locateWorkspace", () => {

	it( "finds the workspace from a nested directory", async () => {

		const root = await locateWorkspace( path.join( FIXTURE_ROOT, "docs", "auth" ) );
		expect( root.absolute ).toBe( await realpath( FIXTURE_ROOT ) );
	} );

	it( "finds the workspace from its root", async () => {

		const root = await locateWorkspace( FIXTURE_ROOT );
		expect( root.absolute ).toBe( await realpath( FIXTURE_ROOT ) );
	} );

	it( "finds the nearest workspace when they are nested", async () => {

		const inner = path.join( m_sandbox, "outer", "inner" );
		await mkdir( path.join( m_sandbox, "outer", ".docctx" ), { "recursive": true } );
		await mkdir( path.join( inner, ".docctx" ), { "recursive": true } );
		await mkdir( path.join( inner, "docs" ) );
		const root = await locateWorkspace( path.join( inner, "docs" ) );
		expect( root.absolute ).toBe( inner );
	} );

	it( "skips a .docctx that is a file", async () => {

		const inner = path.join( m_sandbox, "project", "sub" );
		await mkdir( path.join( m_sandbox, "project", ".docctx" ), { "recursive": true } );
		await mkdir( inner );
		await writeFile( path.join( inner, ".docctx" ), "" );
		const root = await locateWorkspace( inner );
		expect( root.absolute ).toBe( path.join( m_sandbox, "project" ) );
	} );

	it( "throws when no directory above has .docctx", async () => {

		// Assumes nothing above the system temp directory has a .docctx/ directory
		const start = path.join( m_sandbox, "empty" );
		await mkdir( start );
		await expect( locateWorkspace( start ) ).rejects.toBeInstanceOf( WorkspaceNotFoundError );
	} );
} );
