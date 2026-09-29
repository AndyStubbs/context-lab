import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { describeExclusion, describeReason, describeReplaced } from "../../core/scope/describe-scope.js";
import { loadScope } from "../../core/scope/load-scope.js";
import { readScopeFiles } from "../../core/scope/read-scope-files.js";
import type { ResolvedScope, ScopeEntry, ScopeWarning } from "../../core/scope/resolved-scope.js";
import { runTool } from "../run-tool.js";
import { DOC_ARG, SECTION_ARG } from "../tool-args.js";
import { fileBlock, jsonBlock } from "../tool-result.js";

const CONTENT_OMITTED = "file contents were not returned because the scope is over max_context_bytes; " +
	"a narrower section scope would fit";

/** One file in scope. Its role is the list it appears in. */
interface EntryResult {
	readonly path: string;
	readonly size_bytes: number;
	readonly reasons: readonly string[];
}

/** `get_scope` metadata. File contents, when asked for, follow in their own blocks. */
interface ScopeResult {
	readonly doc: string;
	readonly section?: string;
	readonly sources: readonly EntryResult[];
	readonly context: readonly EntryResult[];
	readonly excluded: readonly { readonly path: string; readonly excluded_by: string }[];
	readonly replaced: readonly string[];
	readonly total_bytes: number;
	readonly max_context_bytes: number;
	readonly warnings: readonly string[];
}

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
		const warnings = scope.warnings.map( describeWarning );
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
		const result = formatScope( scope, config.settings.max_context_bytes, warnings );
		return { "content": [ jsonBlock( result ), ...files ] };
	} ) );
}

function formatScope( scope: ResolvedScope, maxBytes: number, warnings: readonly string[] ): ScopeResult {

	return {
		"doc": scope.doc,
		...sectionField( scope.section ),
		"sources": scope.sources.map( formatEntry ),
		"context": scope.context.map( formatEntry ),
		"excluded": scope.excluded.map( ( entry ) => ( {
			"path": entry.path,
			"excluded_by": describeExclusion( entry.excludedBy )
		} ) ),
		"replaced": scope.replaced.map( describeReplaced ),
		"total_bytes": scope.totalBytes,
		"max_context_bytes": maxBytes,
		"warnings": warnings
	};
}

function sectionField( section: string | undefined ): { readonly section?: string } {

	if( section === undefined ) {
		return {};
	}
	return { "section": section };
}

function formatEntry( entry: ScopeEntry ): EntryResult {
	return { "path": entry.path, "size_bytes": entry.sizeBytes, "reasons": entry.reasons.map( describeReason ) };
}

function describeWarning( warning: ScopeWarning ): string {

	switch( warning.kind ) {
		case "no-match":
			return `${warning.rule}: ${warning.pattern} matched no files`;
		case "over-budget":
			return `scope is ${warning.totalBytes} bytes, over max_context_bytes (${warning.maxBytes})`;
		case "unreadable-manifest":
			return `${warning.manifest} is invalid, so its doc was left out: ${warning.message}`;
	}
}
