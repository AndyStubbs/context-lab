import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadScope } from "../../core/scope/load-scope.js";
import { readScopeFiles } from "../../core/scope/read-scope-files.js";
import { runTool } from "../run-tool.js";
import { formatScopeResult } from "../scope-result.js";
import { DOC_ARG, SECTION_ARG } from "../tool-args.js";
import { fileBlock, jsonBlock } from "../tool-result.js";

const CONTENT_OMITTED = "file contents were not returned because the scope is over max_context_bytes; " +
	"a narrower section scope would fit";

/**
 * Registers `get_scope`: the resolved scope with reasons and sizes, and optionally the file
 * contents. Above `max_context_bytes` it returns no contents at all, never a truncated set
 * (DESIGN.md §14.1).
 */
export function registerGetScope( server: McpServer, startDir: string ): void {

	server.registerTool( "get_scope", {
		"description": "Returns the files in scope for a tracked doc or section, with why each is in or out " +
			"and its size. With content: true, also returns the files, unless the scope is over max_context_bytes.",
		"inputSchema": {
			"doc": DOC_ARG,
			"section": SECTION_ARG.optional(),
			"content": z.boolean().optional().describe( "Also return file contents" )
		},
		"annotations": { "readOnlyHint": true }
	}, async ( args ) => runTool( startDir, async ( workspace ) => {

		const { root, config } = workspace;
		const scope = await loadScope( root, config, args.doc, args.section );
		const warnings: string[] = [];
		const files: TextContent[] = [];
		if( args.content === true ) {
			if( scope.warnings.some( ( warning ) => warning.kind === "over-budget" ) ) {
				warnings.push( CONTENT_OMITTED );
			} else {
				for( const file of await readScopeFiles( root, scope ) ) {
					if( file.text === undefined ) {
						files.push( fileBlock( `${file.path} (binary, ${file.sizeBytes} bytes, not shown)`, "" ) );
					} else {
						files.push( fileBlock( file.path, file.text ) );
					}
				}
			}
		}
		const result = formatScopeResult( scope, config.settings.max_context_bytes, warnings );
		return { "content": [ jsonBlock( result ), ...files ] };
	} ) );
}
