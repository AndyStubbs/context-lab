import { mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDocctx } from "../helpers/cli-run.js";

let m_sandbox: string;

beforeEach( async () => {
	m_sandbox = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-cli-init-" ) ) );
} );

afterEach( async () => {
	await rm( m_sandbox, { "recursive": true, "force": true } );
} );

describe( "docctx init", () => {

	it( "lists each file with what changed, and exits 0", async () => {

		const first = await runDocctx( m_sandbox, "init" );
		expect( first ).toEqual( {
			"code": 0,
			"stdout": "created  .docctx/workspace.yaml\ncreated  .gitignore\ncreated  .gitattributes\n",
			"stderr": ""
		} );
		const second = await runDocctx( m_sandbox, "init" );
		expect( second.stdout ).toBe(
			"unchanged  .docctx/workspace.yaml\nunchanged  .gitignore\nunchanged  .gitattributes\n"
		);
	} );

	it( "sets up the folder it is given, relative to the current directory", async () => {

		await mkdir( path.join( m_sandbox, "project" ) );
		const result = await runDocctx( m_sandbox, "init", "project" );
		expect( result.code ).toBe( 0 );
		const config = await stat( path.join( m_sandbox, "project", ".docctx", "workspace.yaml" ) );
		expect( config.isFile() ).toBe( true );
	} );

	it( "exits 1 for a folder that doesn't exist", async () => {

		const result = await runDocctx( m_sandbox, "init", "missing" );
		expect( result.code ).toBe( 1 );
		expect( result.stderr ).toMatch( /^docctx: no such file or directory: .*missing\n$/ );
	} );
} );
