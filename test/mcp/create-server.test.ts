import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INSTRUCTIONS } from "../../src/mcp/instructions.js";
import { callTool, connectClient } from "../helpers/mcp-client.js";
import { fixturePath } from "../helpers/scratch-fixture.js";

/** Claude Code's cap on the `instructions` field (DESIGN.md §14). */
const MAX_INSTRUCTIONS_BYTES = 2048;

let m_client: Client;

beforeEach( async () => {
	m_client = await connectClient( fixturePath( "basic" ) );
} );

afterEach( async () => {
	await m_client.close();
} );

describe( "the MCP server", () => {

	it( "keeps its instructions under 2 KB", () => {
		expect( Buffer.byteLength( INSTRUCTIONS, "utf8" ) ).toBeLessThanOrEqual( MAX_INSTRUCTIONS_BYTES );
	} );

	it( "sends its instructions when a client connects", () => {
		expect( m_client.getInstructions() ).toBe( INSTRUCTIONS );
		expect( m_client.getServerVersion()?.name ).toBe( "contextlabs" );
	} );

	it( "lists its tools, each described in at most two sentences", async () => {

		const { tools } = await m_client.listTools();
		expect( tools.map( ( tool ) => tool.name ) )
			.toEqual( [ "get_status", "read_section", "get_scope", "set_scope" ] );
		for( const tool of tools ) {
			const sentences = ( tool.description ?? "" ).split( /(?<=\.)\s+/ );
			expect( sentences.length, tool.name ).toBeLessThanOrEqual( 2 );
		}
	} );

	it( "marks the read tools read-only, and not the tools that write", async () => {

		const { tools } = await m_client.listTools();
		const readOnly = tools
			.filter( ( tool ) => tool.annotations?.readOnlyHint === true )
			.map( ( tool ) => tool.name );
		expect( readOnly ).toEqual( [ "get_status", "read_section", "get_scope" ] );
	} );

	it( "returns invalid arguments as a tool error", async () => {

		const output = await callTool( m_client, "get_scope", { "doc": 42 } );
		expect( output.isError ).toBe( true );
		expect( output.texts[ 0 ] ).toContain( "Invalid arguments" );
	} );
} );
