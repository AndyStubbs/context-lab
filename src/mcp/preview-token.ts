import { createHash } from "node:crypto";
import type { ScopePreview } from "../core/scope/preview-scope-change.js";

/** Hex characters kept from the hash; enough to tell previews apart, short enough to pass back. */
const TOKEN_LENGTH = 16;

/**
 * The token that ties a chat approval to the preview the user saw (DESIGN.md §14.2). It hashes
 * the proposal, the manifest text before and after, and the resolved file list, so it no longer
 * matches if any of them changed. The server keeps no state: it recomputes the token when the
 * decision arrives.
 *
 * @param proposal The tool arguments that define the change, in a fixed key order, without the
 *     decision and the token.
 */
export function previewToken( proposal: unknown, preview: ScopePreview ): string {

	const material = JSON.stringify( [
		proposal,
		preview.update.previousText ?? null,
		preview.update.text,
		preview.scope.sources.map( ( entry ) => entry.path ),
		preview.scope.context.map( ( entry ) => entry.path )
	] );
	return createHash( "sha256" ).update( material ).digest( "hex" ).slice( 0, TOKEN_LENGTH );
}
