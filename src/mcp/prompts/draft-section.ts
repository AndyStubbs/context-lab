import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadDraftContext } from "../../core/scope/load-draft-context.js";
import { runPrompt } from "../run-prompt.js";
import { requireSection } from "./require-section.js";
import { docArgument, sectionArgument } from "./prompt-args.js";
import { sectionPrompt } from "./section-prompt.js";

/**
 * Registers the `draft-section` prompt: the section's resolved scope and current text, and the
 * task of writing it from the sources only (DESIGN.md §14.3).
 */
export function registerDraftSection( server: McpServer, startDir: string ): void {

	server.registerPrompt( "draft-section", {
		"description": "Draft a section from its declared sources only, then write it with write_section.",
		"argsSchema": { "doc": docArgument( startDir ), "section": sectionArgument( startDir ) }
	}, async ( args ) => runPrompt( startDir, async ( { root, config } ) => {

		const context = await loadDraftContext( root, config, args.doc, args.section );
		requireSection( context );
		return sectionPrompt( context, config.settings.max_context_bytes, { "kind": "draft" } );
	} ) );
}
