import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, describe, expect, it } from "vitest";
import { callTool, callToolJson, connectClient } from "../../helpers/mcp-client.js";
import { copyFixture, fixturePath, removeScratch } from "../../helpers/scratch-fixture.js";

let m_client: Client | undefined;
let m_scratch: string | undefined;

afterEach( async () => {

	await m_client?.close();
	if( m_scratch !== undefined ) {
		await removeScratch( m_scratch );
	}
	m_client = undefined;
	m_scratch = undefined;
} );

async function connect( startDir: string ): Promise<Client> {

	m_client = await connectClient( startDir );
	return m_client;
}

describe( "get_scope", () => {

	it( "returns sources and context with reasons and sizes, and why files are out", async () => {

		const client = await connect( fixturePath( "scope" ) );
		const scope = await callToolJson( client, "get_scope", { "doc": "docs/guide.md", "section": "configure" } );
		expect( scope ).toEqual( {
			"doc": "docs/guide.md",
			"section": "configure",
			"sources": [
				{
					"path": "specs/app.md",
					"size_bytes": 42,
					"reasons": [ "sources: specs/app.md", "sections.configure.context: specs/app.md" ]
				},
				{ "path": "src/app.ts", "size_bytes": 26, "reasons": [ "sources: src/**" ] }
			],
			"context": [],
			"excluded": [
				{ "path": "src/config.ts", "excluded_by": "sections.configure.exclude: src/config.ts" },
				{ "path": "src/generated/schema.ts", "excluded_by": "defaults.exclude: **/generated/**" },
				{ "path": "src/secret.ts", "excluded_by": "exclude: src/secret.ts" }
			],
			"replaced": [
				"defaults.context, by sections.configure.context",
				"context, by sections.configure.context"
			],
			"total_bytes": 68,
			"max_context_bytes": 200000,
			"warnings": [ "sources: specs/missing.md matched no files" ]
		} );
	} );

	it( "leaves out the section field for a whole-doc scope, and returns no contents unless asked", async () => {

		const client = await connect( fixturePath( "basic" ) );
		const output = await callTool( client, "get_scope", { "doc": "docs/auth/overview.md" } );
		expect( output.texts ).toHaveLength( 1 );
		const scope = JSON.parse( output.texts[ 0 ] ?? "" ) as Record<string, unknown>;
		expect( scope[ "doc" ] ).toBe( "docs/auth/overview.md" );
		expect( "section" in scope ).toBe( false );
	} );

	it( "returns each file in full in its own block with content: true, sources first", async () => {

		const basic = fixturePath( "basic" );
		const client = await connect( basic );
		const output = await callTool( client, "get_scope", {
			"doc": "docs/auth/overview.md",
			"section": "token-refresh",
			"content": true
		} );
		const files = output.texts.slice( 1 );
		expect( files.map( ( text ) => text.split( "\n", 1 )[ 0 ] ) ).toEqual( [
			"==> src/auth/refresh.ts <==",
			"==> docs/_glossary.md <==",
			"==> docs/_style.md <==",
			"==> docs/auth/tokens.md <=="
		] );
		const refresh = await readFile( path.join( basic, "src/auth/refresh.ts" ), "utf8" );
		expect( files[ 0 ] ).toBe( `==> src/auth/refresh.ts <==\n${refresh}` );
	} );

	it( "names a binary file in its header instead of returning its bytes", async () => {

		m_scratch = await copyFixture( "basic" );
		await writeFile( path.join( m_scratch, "src/auth/refresh.ts" ), Buffer.from( [ 0x89, 0x50, 0x00, 0x01 ] ) );
		const client = await connect( m_scratch );
		const output = await callTool( client, "get_scope", {
			"doc": "docs/auth/overview.md",
			"section": "token-refresh",
			"content": true
		} );
		expect( output.texts[ 1 ] ).toBe( "==> src/auth/refresh.ts (binary, 4 bytes, not shown) <==\n" );
	} );

	it( "returns paths and sizes but no contents over max_context_bytes, never a truncated set", async () => {

		m_scratch = await copyFixture( "basic" );
		const configPath = path.join( m_scratch, ".docctx/workspace.yaml" );
		const config = await readFile( configPath, "utf8" );
		await writeFile( configPath, config.replace( "max_context_bytes: 200000", "max_context_bytes: 500" ) );

		const client = await connect( m_scratch );
		const output = await callTool( client, "get_scope", {
			"doc": "docs/auth/overview.md",
			"section": "token-refresh",
			"content": true
		} );
		expect( output.isError ).toBe( false );
		expect( output.texts ).toHaveLength( 1 );
		const scope = JSON.parse( output.texts[ 0 ] ?? "" ) as { readonly warnings: readonly string[] };
		expect( scope.warnings ).toEqual( [
			"scope is 874 bytes, over max_context_bytes (500)",
			"file contents were not returned because the scope is over max_context_bytes; " +
				"a narrower section scope would fit"
		] );
	} );
} );
