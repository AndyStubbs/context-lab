import { describeExclusion, describeReason, describeReplaced } from "../core/scope/describe-scope.js";
import type { ResolvedScope, ScopeEntry, ScopeWarning } from "../core/scope/resolved-scope.js";

/** One file in scope. Its role is the list it appears in. */
interface EntryResult {
	readonly path: string;
	readonly size_bytes: number;
	readonly reasons: readonly string[];
}

/** A resolved scope as tools return it: `get_scope`'s result, and `set_scope`'s preview. */
export interface ScopeResult {
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
 * Maps a resolved scope to its tool result, with the same wording as `docctx scope`.
 *
 * @param extraWarnings Added after the scope's own warnings.
 */
export function formatScopeResult(
	scope: ResolvedScope,
	maxBytes: number,
	extraWarnings: readonly string[] = []
): ScopeResult {

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
		"warnings": [ ...scope.warnings.map( describeScopeWarning ), ...extraWarnings ]
	};
}

/** One scope warning as a single line. */
export function describeScopeWarning( warning: ScopeWarning ): string {

	switch( warning.kind ) {
		case "no-match":
			return `${warning.rule}: ${warning.pattern} matched no files`;
		case "over-budget":
			return `scope is ${warning.totalBytes} bytes, over max_context_bytes (${warning.maxBytes})`;
		case "unreadable-manifest":
			return `${warning.manifest} is invalid, so its doc was left out: ${warning.message}`;
	}
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
