import path from "node:path";
import type { Command } from "commander";
import { WorkspaceRoot } from "../../core/paths/workspace-root.js";
import { initWorkspace } from "../../core/workspace/init-workspace.js";
import type { CliIo } from "../cli-io.js";

/**
 * `docctx init [dir]`: sets up a workspace. Safe to run again; it never overwrites
 * `workspace.yaml`.
 */
export function registerInitCommand( program: Command, io: CliIo ): void {

	program
		.command( "init" )
		.description( "Set up a ContextLabs workspace: .docctx/workspace.yaml, .gitignore and .gitattributes." )
		.argument( "[dir]", "folder to set up, relative to the current directory", "." )
		.action( async ( dir: string ) => {

			const root = await WorkspaceRoot.open( path.resolve( io.cwd, dir ) );
			const changes = await initWorkspace( root );
			const width = Math.max( ...changes.map( ( entry ) => entry.change.length ) );
			io.stdout( changes.map( ( entry ) => `${entry.change.padEnd( width )}  ${entry.path}\n` ).join( "" ) );
		} );
}
