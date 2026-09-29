import path from "node:path";
import type { Command } from "commander";
import { serveStdio } from "../../mcp/serve-stdio.js";
import type { CliIo } from "../cli-io.js";

/** Overrides the directory the workspace is looked up from. */
const WORKSPACE_ENV = "DOCCTX_WORKSPACE";

/**
 * `docctx serve`: starts the MCP server over stdio (DESIGN.md §14). It returns when the client
 * closes stdin.
 */
export function registerServeCommand( program: Command, io: CliIo, version: string ): void {

	program
		.command( "serve" )
		.description( "Start the MCP server over stdio." )
		.option( "--workspace <dir>", `workspace directory (default: $${WORKSPACE_ENV}, then the current directory)` )
		.action( async ( options: { readonly workspace?: string } ) => {
			await serveStdio( { "startDir": serveStartDir( io, options.workspace ), "version": version } );
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
