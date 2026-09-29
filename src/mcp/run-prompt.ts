import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { OpenWorkspace } from "./run-in-workspace.js";
import { runInWorkspace } from "./run-in-workspace.js";

/**
 * Runs a prompt body against the workspace found from `startDir` (see `runInWorkspace`).
 * Prompts have no error result, so an expected failure becomes an `InvalidParams` error whose
 * message the client shows the user.
 */
export async function runPrompt(
	startDir: string,
	body: ( workspace: OpenWorkspace ) => Promise<GetPromptResult>
): Promise<GetPromptResult> {

	return runInWorkspace( startDir, "a prompt", body, ( message ) => {
		throw new McpError( ErrorCode.InvalidParams, message );
	} );
}
