import { realpath } from "node:fs/promises";
import type { Command } from "commander";
import { loadScope } from "../../core/scope/load-scope.js";
import { locateWorkspace } from "../../core/workspace/locate-workspace.js";
import { readWorkspaceConfig } from "../../core/workspace/read-workspace-config.js";
import type { CliIo } from "../cli-io.js";
import { toWorkspacePath } from "../cli-paths.js";
import { formatScope } from "../format-scope.js";

/**
 * `docctx scope <doc> [section]`: prints the resolved scope and why each file is in or out.
 */
export function registerScopeCommand( program: Command, io: CliIo ): void {

	program
		.command( "scope" )
		.description( "Show the files in scope for a doc or section, and why each one is in or out." )
		.argument( "<doc>", "doc path, relative to the current directory" )
		.argument( "[section]", "section key, such as token-refresh or setup/install" )
		.option( "--json", "print the resolved scope as JSON" )
		.addHelpText( "after", "\nExit codes: 0 resolved (warnings included), 1 error, 2 usage error." )
		.action( async ( doc: string, section: string | undefined, options: { readonly json?: boolean } ) => {

			const cwd = await realpath( io.cwd );
			const root = await locateWorkspace( cwd );
			const config = await readWorkspaceConfig( root );
			const scope = await loadScope( root, config, toWorkspacePath( root, cwd, doc ), section );
			if( options.json === true ) {
				io.stdout( `${JSON.stringify( scope, null, "\t" )}\n` );
			} else {
				io.stdout( formatScope( scope, config.settings.max_context_bytes ) );
			}
		} );
}
