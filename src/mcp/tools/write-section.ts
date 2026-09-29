import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeSection } from "../../core/sections/write-section.js";
import { runTool } from "../run-tool.js";
import { DOC_ARG, SECTION_ARG } from "../tool-args.js";
import { jsonBlock } from "../tool-result.js";

/**
 * Registers `write_section`: replaces one section of a tracked doc after saving the previous
 * text to local history (DESIGN.md §14.1, §18; ROADMAP.md Phase 3, PR 3). It never verifies
 * the section.
 */
export function registerWriteSection( server: McpServer, startDir: string ): void {

	server.registerTool( "write_section", {
		"description": "Replaces one section of a tracked doc, subsections included, keeping the previous text " +
			"in local history; it doesn't verify the section. The text starts with the section's heading, and " +
			"base_hash is the hash read_section returned for it.",
		"inputSchema": {
			"doc": DOC_ARG,
			"section": SECTION_ARG.optional(),
			"text": z.string(),
			"base_hash": z.string().min( 1 )
		}
	}, async ( args ) => runTool( startDir, async ( { root, config } ) => {

		const written = await writeSection( root, config, args.doc, args.section, args.text, args.base_hash );
		const result: Record<string, unknown> = { "result": "written", "doc": written.doc };
		if( written.section !== undefined ) {
			result[ "section" ] = written.section.key;
		}
		result[ "lines" ] = written.lines;
		result[ "history" ] = written.history.path;
		return { "content": [ jsonBlock( result ) ] };
	} ) );
}
