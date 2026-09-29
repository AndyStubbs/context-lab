import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadDraftContext } from "../../core/scope/load-draft-context.js";
import { runPrompt } from "../run-prompt.js";
import { requireSection } from "./require-section.js";
import { docArgument, sectionArgument } from "./prompt-args.js";
import { sectionPrompt } from "./section-prompt.js";

/**
 * Registers the `revise-section` prompt: the section's resolved scope and current text, and
 * the user's instruction for a targeted change (DESIGN.md §14.3).
 */
export function registerReviseSection( server: McpServer, startDir: string ): void {

	server.registerPrompt( "revise-section", {
		"description": "Revise a section as you instruct, from its declared sources, then write it with write_section.",
		"argsSchema": {
			"doc": docArgument( startDir ),
			"section": sectionArgument( startDir ),
			"instruction": z.string().min( 1 ).describe( "What to change" )
		}
	}, async ( args ) => runPrompt( startDir, async ( { root, config } ) => {

		const context = await loadDraftContext( root, config, args.doc, args.section );
		requireSection( context );
		const task = { "kind": "revise", "instruction": args.instruction } as const;
		return sectionPrompt( context, config.settings.max_context_bytes, task );
	} ) );
}
