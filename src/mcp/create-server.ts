import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCTIONS } from "./instructions.js";
import { registerGetScope } from "./tools/get-scope.js";
import { registerGetStatus } from "./tools/get-status.js";
import { registerReadSection } from "./tools/read-section.js";
import { registerSetScope } from "./tools/set-scope.js";

/** How the server finds its workspace and describes itself. */
export interface ServerOptions {

	/** Absolute directory the workspace is looked up from, walking up (DESIGN.md §7). */
	readonly startDir: string;
	readonly version: string;
}

/**
 * Builds the MCP server with its tools, not yet connected to a transport (DESIGN.md §14).
 */
export function createServer( options: ServerOptions ): McpServer {

	const server = new McpServer(
		{ "name": "contextlabs", "version": options.version },
		{ "instructions": INSTRUCTIONS }
	);
	registerGetStatus( server, options.startDir );
	registerReadSection( server, options.startDir );
	registerGetScope( server, options.startDir );
	registerSetScope( server, options.startDir );
	return server;
}
