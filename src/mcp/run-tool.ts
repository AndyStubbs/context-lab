import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { OpenWorkspace } from "./run-in-workspace.js";
import { runInWorkspace } from "./run-in-workspace.js";
import { errorResult } from "./tool-result.js";

/**
 * Runs a tool body against the workspace found from `startDir` (see `runInWorkspace`).
 * Expected failures come back as `isError` results.
 */
export async function runTool(
	startDir: string,
	body: ( workspace: OpenWorkspace ) => Promise<CallToolResult>
): Promise<CallToolResult> {
	return runInWorkspace( startDir, "a tool call", body, errorResult );
}
