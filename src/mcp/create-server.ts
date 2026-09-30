import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCTIONS } from "./instructions.js";
import { registerDraftSection } from "./prompts/draft-section.js";
import { registerReviseSection } from "./prompts/revise-section.js";
import { registerGetScope } from "./tools/get-scope.js";
import { registerGetStatus } from "./tools/get-status.js";
import { registerReadSection } from "./tools/read-section.js";
import { registerSetScope } from "./tools/set-scope.js";
import { registerWriteSection } from "./tools/write-section.js";

/**
 * How `set_scope` asks the user (DESIGN.md §14.2):
 * - `auto`: through elicitation when the client advertises it, otherwise through chat
 * - `chat`: always through chat, for clients that advertise elicitation but never show the
 *   form, such as Claude Code in print mode
 */
export type ApprovalMode = "auto" | "chat";

/** How the server finds its workspace, describes itself and asks for approvals. */
export interface ServerOptions {

	/** Absolute directory the workspace is looked up from, walking up (DESIGN.md §7). */
	readonly startDir: string;
	readonly version: string;

	/** Defaults to `auto`. Set by the user in the client's config, never by the AI. */
	readonly approvals?: ApprovalMode;
}

/**
 * Builds the MCP server with its tools and prompts, not yet connected to a transport (DESIGN.md §14).
 */
export function createServer( options: ServerOptions ): McpServer {

	const server = new McpServer(
		{ "name": "contextlabs", "version": options.version },
		{ "instructions": INSTRUCTIONS }
	);
	registerGetStatus( server, options.startDir );
	registerReadSection( server, options.startDir );
	registerGetScope( server, options.startDir );
	registerSetScope( server, options.startDir, options.approvals ?? "auto" );
	registerWriteSection( server, options.startDir );
	registerDraftSection( server, options.startDir );
	registerReviseSection( server, options.startDir );
	return server;
}
