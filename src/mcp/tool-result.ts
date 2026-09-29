import type { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool metadata as compact JSON in a text block (ROADMAP.md Phase 3, decision 1). Keys are
 * `snake_case`, like the tool arguments.
 */
export function jsonBlock( value: unknown ): TextContent {
	return { "type": "text", "text": JSON.stringify( value ) };
}

/**
 * File or section text in its own block, unescaped, after a header line naming it. The text
 * is returned as written, with no framing that could read as instructions (DESIGN.md §18).
 *
 * @param label The path, and for a section its key and line range.
 */
export function fileBlock( label: string, text: string ): TextContent {
	return { "type": "text", "text": `==> ${label} <==\n${text}` };
}

/** An expected failure, as a result the model can act on rather than a protocol error. */
export function errorResult( message: string ): CallToolResult {
	return { "content": [ { "type": "text", "text": message } ], "isError": true };
}
