import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callTool, connectClient } from "../../helpers/mcp-client.js";
import { fixturePath } from "../../helpers/scratch-fixture.js";

let m_client: Client;

beforeEach( async () => {
	m_client = await connectClient( fixturePath( "basic" ) );
} );

afterEach( async () => {
	await m_client.close();
} );

describe( "read_section", () => {

	it( "returns one section as written, with subsections, after a header line", async () => {

		const args = { "doc": "docs/auth/overview.md", "section": "setup" };
		const output = await callTool( m_client, "read_section", args );
		expect( output ).toEqual( {
			"isError": false,
			"texts": [
				"==> docs/auth/overview.md § setup (lines 17-22) <==\n" +
				"## Setup\n\n### Install\n\nInstall the client library with `npm install @example/auth`.\n\n"
			]
		} );
	} );

	it( "returns a doc without sections in full", async () => {

		const scope = fixturePath( "scope" );
		const client = await connectClient( scope );
		try {
			const output = await callTool( client, "read_section", { "doc": "api/openapi.yaml" } );
			const text = await readFile( path.join( scope, "api/openapi.yaml" ), "utf8" );
			expect( output.texts ).toEqual( [ `==> api/openapi.yaml <==\n${text}` ] );
		} finally {
			await client.close();
		}
	} );

	it( "requires a section for a doc that has sections", async () => {

		const output = await callTool( m_client, "read_section", { "doc": "docs/auth/overview.md" } );
		expect( output ).toEqual( {
			"isError": true,
			"texts": [
				"docs/auth/overview.md has sections, so pass a section key; get_status with this doc lists them."
			]
		} );
	} );

	it( "only reads tracked docs", async () => {

		const output = await callTool( m_client, "read_section", { "doc": "docs/_style.md" } );
		expect( output.isError ).toBe( true );
		expect( output.texts[ 0 ] ).toContain( "not tracked" );
	} );
} );
