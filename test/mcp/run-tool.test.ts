import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callTool, connectClient } from "../helpers/mcp-client.js";
import { copyFixture, removeScratch } from "../helpers/scratch-fixture.js";

let m_scratch: string;

beforeEach( async () => {
	m_scratch = await copyFixture( "basic" );
} );

afterEach( async () => {
	await removeScratch( m_scratch );
} );

/** Calls a tool on a fresh client for the scratch workspace and expects a tool error. */
async function expectToolError(
	name: string,
	args: Record<string, unknown>,
	startDir = m_scratch
): Promise<string> {

	const client = await connectClient( startDir );
	try {
		const output = await callTool( client, name, args );
		expect( output.isError ).toBe( true );
		return output.texts.join( "\n" );
	} finally {
		await client.close();
	}
}

describe( "tool errors", () => {

	it( "reports an untracked doc", async () => {

		const message = await expectToolError( "get_scope", { "doc": "docs/_style.md" } );
		expect( message ).toBe(
			"Doc is not tracked (it has no manifest): \"docs/_style.md\". Propose a scope with set_scope to track it."
		);
	} );

	it( "points to get_status for an unknown section", async () => {

		const args = { "doc": "docs/auth/overview.md", "section": "install" };
		const message = await expectToolError( "read_section", args );
		expect( message ).toBe(
			"docs/auth/overview.md has no section \"install\". get_status with this doc lists its section keys."
		);
	} );

	it( "names the workspace root when a path is absolute or outside the workspace", async () => {

		const doc = path.join( m_scratch, "docs/auth/overview.md" );
		const absolute = await expectToolError( "get_status", { "doc": doc } );
		expect( absolute ).toContain( "(absolute)" );
		expect( absolute ).toContain( `Tool paths are relative to the workspace root, ${m_scratch}.` );

		const escaping = await expectToolError( "read_section", { "doc": "../outside.md" } );
		expect( escaping ).toContain( "(escapes-root)" );
	} );

	it( "reports an invalid manifest with its line and column", async () => {

		await writeFile( path.join( m_scratch, ".docctx/docs/auth/overview.md.yaml" ), "doc: docs/auth/overview.md\n" );
		const message = await expectToolError( "get_scope", { "doc": "docs/auth/overview.md" } );
		expect( message ).toBe(
			".docctx/docs/auth/overview.md.yaml:1:1: missing required field `type`\n" +
			".docctx/docs/auth/overview.md.yaml:1:1: missing required field `status`"
		);
	} );

	it( "reports a missing doc by its workspace path", async () => {

		const message = await expectToolError( "get_status", { "doc": "docs/nowhere.md" } );
		expect( message ).toBe( "No such file: docs/nowhere.md" );
	} );

	it( "refuses paths under .docctx/", async () => {

		const message = await expectToolError( "read_section", { "doc": ".docctx/workspace.yaml" } );
		expect( message ).toContain( "reserved" );
	} );

	it( "explains how to point the server at a workspace when none is found", async () => {

		const empty = await realpath( await mkdtemp( path.join( tmpdir(), "docctx-empty-" ) ) );
		try {
			const message = await expectToolError( "get_status", {}, empty );
			expect( message ).toContain( "No .docctx/ directory found" );
			expect( message ).toContain( "--workspace <dir>" );
		} finally {
			await rm( empty, { "recursive": true, "force": true } );
		}
	} );
} );
