import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocManifest } from "../../core/manifest/doc-manifest.js";
import type { WorkspaceRoot } from "../../core/paths/workspace-root.js";
import type { DocStatus } from "../../core/status/load-doc-status.js";
import { loadDocStatus } from "../../core/status/load-doc-status.js";
import type { WorkspaceStatus } from "../../core/status/load-workspace-status.js";
import { loadWorkspaceStatus } from "../../core/status/load-workspace-status.js";
import type { WorkspaceConfig } from "../../core/workspace/workspace-config.js";
import { runTool } from "../run-tool.js";
import { DOC_ARG } from "../tool-args.js";
import { jsonBlock } from "../tool-result.js";

/** `get_status` without a doc. */
interface WorkspaceStatusResult {
	readonly workspace: string;

	/** Type, then status, then doc paths, in the workspace's type and lifecycle order. */
	readonly docs: Record<string, Record<string, readonly string[]>>;
	readonly problems: readonly { readonly manifest: string; readonly doc: string; readonly message: string }[];
	readonly orphaned_sections: Record<string, readonly string[]>;
	readonly missing_docs: readonly string[];
}

/** `get_status` with a doc. */
interface DocStatusResult {
	readonly doc: string;
	readonly tracked: boolean;
	readonly type?: string;
	readonly status?: string;
	readonly kind: "markdown" | "single";
	readonly lines: number;
	readonly sections: readonly {
		readonly key: string;
		readonly title: string;
		readonly depth: number;

		/** First and last line, subsections included. */
		readonly lines: readonly [ number, number ];
	}[];
	readonly orphaned_sections: readonly string[];
	readonly warnings: readonly { readonly line: number; readonly message: string }[];
}

/**
 * Registers `get_status`: the workspace summary, or one doc's outline (DESIGN.md §14.1).
 * Section states come in Phase 4.
 */
export function registerGetStatus( server: McpServer, startDir: string ): void {

	server.registerTool( "get_status", {
		"description": "Without doc: tracked docs by type and status, plus invalid manifests and orphaned " +
			"section keys. With doc: its section outline (keys, titles, line ranges), tracked or not.",
		"inputSchema": { "doc": DOC_ARG.optional() },
		"annotations": { "readOnlyHint": true }
	}, async ( args ) => runTool( startDir, async ( workspace ) => {

		if( args.doc === undefined ) {
			const status = await loadWorkspaceStatus( workspace.root, workspace.config );
			return { "content": [ jsonBlock( formatWorkspace( workspace.root, workspace.config, status ) ) ] };
		}
		const status = await loadDocStatus( workspace.root, workspace.config, args.doc );
		return { "content": [ jsonBlock( formatDoc( status ) ) ] };
	} ) );
}

function formatWorkspace(
	root: WorkspaceRoot,
	config: WorkspaceConfig,
	status: WorkspaceStatus
): WorkspaceStatusResult {

	const docs: Record<string, Record<string, readonly string[]>> = {};
	for( const [ type, docType ] of config.types ) {
		const byStatus: Record<string, readonly string[]> = {};
		for( const lifecycle of docType.statuses ) {
			const paths = status.docs
				.filter( ( manifest ) => manifest.type === type && manifest.status === lifecycle )
				.map( ( manifest ) => manifest.doc );
			if( paths.length > 0 ) {
				byStatus[ lifecycle ] = paths;
			}
		}
		if( Object.keys( byStatus ).length > 0 ) {
			docs[ type ] = byStatus;
		}
	}
	return {
		"workspace": root.absolute,
		"docs": docs,
		"problems": status.problems.map( ( problem ) => ( {
			"manifest": problem.path,
			"doc": problem.doc,
			"message": problem.message
		} ) ),
		"orphaned_sections": Object.fromEntries( status.orphanedSections ),
		"missing_docs": status.missingDocs
	};
}

function formatDoc( status: DocStatus ): DocStatusResult {

	return {
		"doc": status.outline.doc,
		"tracked": status.manifest !== undefined,
		...manifestFields( status.manifest ),
		"kind": status.outline.kind,
		"lines": status.outline.lineCount,
		"sections": status.outline.sections.map( ( section ) => ( {
			"key": section.key,
			"title": section.title,
			"depth": section.depth,
			"lines": [ section.startLine, section.endLine ] as const
		} ) ),
		"orphaned_sections": status.orphanedSections,
		"warnings": status.outline.warnings.map( ( warning ) => ( {
			"line": warning.line,
			"message": warning.message
		} ) )
	};
}

function manifestFields( manifest: DocManifest | undefined ): { readonly type?: string; readonly status?: string } {

	if( manifest === undefined ) {
		return {};
	}
	return { "type": manifest.type, "status": manifest.status };
}
