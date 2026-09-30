import path from "node:path";
import type { Command } from "commander";
import { Option } from "commander";
import type { ApprovalMode } from "../../mcp/create-server.js";
import { serveStdio } from "../../mcp/serve-stdio.js";
import type { CliIo } from "../cli-io.js";

/** Overrides the directory the workspace is looked up from. */
const WORKSPACE_ENV = "DOCCTX_WORKSPACE";

/** Sets the approval mode when `--approvals` isn't given. */
const APPROVALS_ENV = "DOCCTX_APPROVALS";

const APPROVAL_MODES: readonly ApprovalMode[] = [ "auto", "chat" ];

/**
 * `docctx serve`: starts the MCP server over stdio (DESIGN.md §14). It returns when the client
 * closes stdin.
 */
export function registerServeCommand( program: Command, io: CliIo, version: string ): void {

	const serve: Command = program
		.command( "serve" )
		.description( "Start the MCP server over stdio." )
		.option( "--workspace <dir>", `workspace directory (default: $${WORKSPACE_ENV}, then the current directory)` )
		.addOption(
			new Option(
				"--approvals <mode>",
				"how set_scope asks the user: auto uses forms when the client offers them, chat always asks " +
				`in chat (default: $${APPROVALS_ENV}, then auto)`
			).choices( APPROVAL_MODES )
		);
	serve.action( async ( options: { readonly workspace?: string; readonly approvals?: ApprovalMode } ) => {

		const approvals = serveApprovals( io, options.approvals );
		if( approvals === undefined ) {
			serve.error(
				`error: ${APPROVALS_ENV} must be one of ${APPROVAL_MODES.join( ", " )}, ` +
				`not ${JSON.stringify( io.env[ APPROVALS_ENV ] )}`
			);
		}
		await serveStdio( {
			"startDir": serveStartDir( io, options.workspace ),
			"version": version,
			"approvals": approvals
		} );
	} );
}

/**
 * The directory the server looks up its workspace from: `--workspace`, then
 * `DOCCTX_WORKSPACE`, then the current directory. Relative values are relative to the current
 * directory.
 */
export function serveStartDir( io: CliIo, workspace: string | undefined ): string {

	if( workspace !== undefined ) {
		return path.resolve( io.cwd, workspace );
	}
	const fromEnv = io.env[ WORKSPACE_ENV ];
	if( fromEnv !== undefined && fromEnv !== "" ) {
		return path.resolve( io.cwd, fromEnv );
	}
	return path.resolve( io.cwd );
}

/**
 * The approval mode: `--approvals` (commander checks its value), then `DOCCTX_APPROVALS`, then
 * `auto`. It is set where the user configures the server, so the AI can't change it.
 *
 * @returns `undefined` when `DOCCTX_APPROVALS` holds something other than a mode.
 */
export function serveApprovals( io: CliIo, approvals: ApprovalMode | undefined ): ApprovalMode | undefined {

	if( approvals !== undefined ) {
		return approvals;
	}
	const fromEnv = io.env[ APPROVALS_ENV ];
	if( fromEnv === undefined || fromEnv === "" ) {
		return "auto";
	}
	return APPROVAL_MODES.find( ( mode ) => mode === fromEnv );
}
