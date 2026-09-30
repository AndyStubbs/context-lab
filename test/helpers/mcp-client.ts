import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ElicitRequest, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ApprovalMode } from "../../src/mcp/create-server.js";
import { createServer } from "../../src/mcp/create-server.js";

/** A tool result reduced to what tests check: the error flag and each text block. */
export interface ToolOutput {
	readonly isError: boolean;
	readonly texts: readonly string[];
}

/** Answers an elicitation request the way a user would. */
export type ElicitHandler = ( params: ElicitRequest[ "params" ] ) => ElicitResult | Promise<ElicitResult>;

/**
 * Connects an SDK client to a fresh server over an in-memory transport. The server looks up
 * its workspace from `startDir`. Close the client when done.
 *
 * @param elicit When given, the client declares elicitation support and answers with it.
 * @param approvals The server's approval mode; `auto` when omitted.
 */
export async function connectClient(
	startDir: string,
	elicit?: ElicitHandler,
	approvals: ApprovalMode = "auto"
): Promise<Client> {

	const server = createServer( { "startDir": startDir, "version": "0.0.0-test", "approvals": approvals } );
	const [ clientTransport, serverTransport ] = InMemoryTransport.createLinkedPair();
	await server.connect( serverTransport );
	const client = createClient( elicit );
	await client.connect( clientTransport );
	return client;
}

/** An SDK client, with elicitation support when `elicit` is given. */
export function createClient( elicit?: ElicitHandler ): Client {

	const info = { "name": "docctx-test", "version": "0.0.0" };
	if( elicit === undefined ) {
		return new Client( info );
	}
	const client = new Client( info, { "capabilities": { "elicitation": { "form": {} } } } );
	client.setRequestHandler( ElicitRequestSchema, async ( request ) => elicit( request.params ) );
	return client;
}

/** Calls a tool and returns its text blocks. */
export async function callTool( client: Client, name: string, args: Record<string, unknown> ): Promise<ToolOutput> {

	const result = await client.callTool( { "name": name, "arguments": args } );
	const content: unknown = result.content;
	const texts: string[] = [];
	if( Array.isArray( content ) ) {
		for( const block of content as unknown[] ) {
			if( typeof block === "object" && block !== null && "text" in block && typeof block.text === "string" ) {
				texts.push( block.text );
			}
		}
	}
	return { "isError": result.isError === true, "texts": texts };
}

/** Calls a tool that must succeed and parses its first block as JSON. */
export async function callToolJson( client: Client, name: string, args: Record<string, unknown> ): Promise<unknown> {

	const output = await callTool( client, name, args );
	if( output.isError ) {
		throw new Error( `${name} failed: ${output.texts.join( "\n" )}` );
	}
	return JSON.parse( output.texts[ 0 ] ?? "" );
}
