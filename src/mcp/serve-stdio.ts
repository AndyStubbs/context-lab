import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { locateWorkspace } from "../core/workspace/locate-workspace.js";
import type { ServerOptions } from "./create-server.js";
import { createServer } from "./create-server.js";

/**
 * Serves MCP over stdin and stdout until the client closes stdin. stdout carries JSON-RPC, so
 * everything else goes to stderr.
 *
 * Returns once stdin ends. Tool calls still running at that point finish and send their
 * results, and the process exits when they are done.
 */
export async function serveStdio( options: ServerOptions ): Promise<void> {

	await logWorkspace( options.startDir );
	if( options.approvals === "chat" ) {
		console.error( "contextlabs: approvals go through chat (--approvals chat), even if the client offers forms" );
	}
	const server = createServer( options );

	// The transport doesn't notice the client leaving. Closing it here would drop the results
	// of calls still in flight, so stdin ending only ends the wait.
	const ended = new Promise<void>( ( resolve ) => {
		process.stdin.once( "end", resolve );
		server.server.onclose = resolve;
	} );
	await server.connect( new StdioServerTransport() );
	await ended;
}

/** Tells the client log which workspace is served, or why tool calls will fail. */
async function logWorkspace( startDir: string ): Promise<void> {

	try {
		const root = await locateWorkspace( startDir );
		console.error( `contextlabs: serving the workspace at ${root.absolute}` );
	} catch( error ) {
		if( !( error instanceof Error ) ) {
			throw error;
		}
		console.error( `contextlabs: ${error.message}. Tool calls will report this until one exists.` );
	}
}
