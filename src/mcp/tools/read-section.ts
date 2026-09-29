import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadSection } from "../../core/sections/load-section.js";
import { sectionHash } from "../../core/sections/section-hash.js";
import { runTool } from "../run-tool.js";
import { DOC_ARG, SECTION_ARG } from "../tool-args.js";
import { errorResult, fileBlock } from "../tool-result.js";

/**
 * Registers `read_section`: one section of a tracked doc, subsections included, or the whole
 * doc when it has no sections (DESIGN.md §14.1; ROADMAP.md Phase 3, decision 3).
 */
export function registerReadSection( server: McpServer, startDir: string ): void {

	server.registerTool( "read_section", {
		"description": "Returns one section of a tracked doc as written, subsections included, with the hash " +
			"write_section needs. Omit section only for a doc without sections, such as a non-markdown doc.",
		"inputSchema": { "doc": DOC_ARG, "section": SECTION_ARG.optional() },
		"annotations": { "readOnlyHint": true }
	}, async ( args ) => runTool( startDir, async ( workspace ) => {

		const loaded = await loadSection( workspace.root, workspace.config, args.doc, args.section );
		const doc = loaded.outline.doc;
		if( loaded.section === undefined ) {

			// Serve slices, not whole files (DESIGN.md §5 principle 4)
			if( loaded.outline.sections.length > 0 ) {
				return errorResult(
					`${doc} has sections, so pass a section key; get_status with this doc lists them.`
				);
			}
			return { "content": [ fileBlock( `${doc} (hash ${sectionHash( loaded.text )})`, loaded.text ) ] };
		}

		// The hash is what write_section needs back (PR 3 decision 4)
		const section = loaded.section;
		const label = `${doc} § ${section.key} (lines ${section.startLine}-${section.endLine}, ` +
			`hash ${sectionHash( loaded.text )})`;
		return { "content": [ fileBlock( label, loaded.text ) ] };
	} ) );
}
