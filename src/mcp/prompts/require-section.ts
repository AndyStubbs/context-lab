import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { DraftContext } from "../../core/scope/load-draft-context.js";
import { needsSectionMessage } from "../section-label.js";

/**
 * Prompts serve one section, like `read_section`: the whole doc only when it has no sections
 * (DESIGN.md §5 principle 4).
 *
 * @throws McpError (`InvalidParams`) when no section was named for a doc that has sections.
 */
export function requireSection( context: DraftContext ): void {

	const loaded = context.section;
	if( loaded.section === undefined && loaded.outline.sections.length > 0 ) {
		throw new McpError( ErrorCode.InvalidParams, needsSectionMessage( loaded.outline.doc ) );
	}
}
