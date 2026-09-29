import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callTool, callToolJson, connectClient } from "../../helpers/mcp-client.js";
import { copyFixture, removeScratch } from "../../helpers/scratch-fixture.js";

const OVERVIEW = "docs/auth/overview.md";

let m_scratch: string;
let m_client: Client;

beforeEach( async () => {

	m_scratch = await copyFixture( "basic" );
	m_client = await connectClient( m_scratch );
} );

afterEach( async () => {

	await m_client.close();
	await removeScratch( m_scratch );
} );

/** Reads a section through read_section and returns the hash from its header line. */
async function readHash( section: string ): Promise<string> {

	const output = await callTool( m_client, "read_section", { "doc": OVERVIEW, "section": section } );
	const header = ( output.texts[ 0 ] ?? "" ).split( "\n", 1 )[ 0 ] ?? "";
	const match = /, hash ([0-9a-f]{16})\) <==$/.exec( header );
	expect( match, header ).not.toBeNull();
	return match?.[ 1 ] ?? "";
}

describe( "write_section", () => {

	it( "writes a section with the hash read_section returned, and says where the old text went", async () => {

		const hash = await readHash( "token-refresh" );
		const result = await callToolJson( m_client, "write_section", {
			"doc": OVERVIEW,
			"section": "token-refresh",
			"text": "## Token refresh\n\nTokens refresh every 10 minutes.\n",
			"base_hash": hash
		} );
		expect( result ).toEqual( {
			"result": "written",
			"doc": OVERVIEW,
			"section": "token-refresh",
			"lines": [ 5, 8 ],
			"history": ".docctx/.history/docs/auth/overview.md/token-refresh/0001.md"
		} );
		expect( await readFile( path.join( m_scratch, OVERVIEW ), "utf8" ) ).toContain( "every 10 minutes" );
	} );

	it( "refuses a stale hash and tells the AI to read again", async () => {

		const hash = await readHash( "token-refresh" );
		await callToolJson( m_client, "write_section", {
			"doc": OVERVIEW,
			"section": "token-refresh",
			"text": "## Token refresh\n\nFirst edit.\n",
			"base_hash": hash
		} );
		const output = await callTool( m_client, "write_section", {
			"doc": OVERVIEW,
			"section": "token-refresh",
			"text": "## Token refresh\n\nSecond edit.\n",
			"base_hash": hash
		} );
		expect( output.isError ).toBe( true );
		expect( output.texts[ 0 ] ).toBe(
			"docs/auth/overview.md § token-refresh changed since it was read. " +
			"Read it again with read_section, and redo the change against the new text."
		);
	} );

	it( "returns shape and orphan refusals as tool errors", async () => {

		const hash = await readHash( "token-refresh" );
		const shape = await callTool( m_client, "write_section", {
			"doc": OVERVIEW,
			"section": "token-refresh",
			"text": "No heading.\n",
			"base_hash": hash
		} );
		expect( shape.isError ).toBe( true );
		expect( shape.texts[ 0 ] ).toContain( "must start with a level 2 heading" );

		const orphan = await callTool( m_client, "write_section", {
			"doc": OVERVIEW,
			"section": "token-refresh",
			"text": "## Refreshing tokens\n",
			"base_hash": hash
		} );
		expect( orphan.isError ).toBe( true );
		expect( orphan.texts[ 0 ] ).toContain( "matching no heading: token-refresh" );
	} );

	it( "points an untracked doc to set_scope", async () => {

		const output = await callTool( m_client, "write_section", {
			"doc": "docs/_style.md",
			"text": "# Style\n",
			"base_hash": "0000000000000000"
		} );
		expect( output.texts[ 0 ] ).toBe(
			"Doc is not tracked (it has no manifest): \"docs/_style.md\". Propose a scope with set_scope to track it."
		);
	} );
} );
