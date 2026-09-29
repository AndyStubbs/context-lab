import type { ContextList } from "../core/manifest/doc-manifest.js";
import { isReplaceContext } from "../core/manifest/doc-manifest.js";
import type { NewManifestFields } from "../core/manifest/manifest-editor.js";
import type { ScopeChange } from "../core/manifest/scope-change.js";
import { formatBytes } from "../core/scope/format-bytes.js";
import type { ScopePreview } from "../core/scope/preview-scope-change.js";
import { describeScopeWarning } from "./scope-result.js";

type ScopeField = "sources" | "context" | "exclude";

const SCOPE_FIELDS: readonly ScopeField[] = [ "sources", "context", "exclude" ];

/**
 * The message the user approves a scope change from, in at most three lines (DESIGN.md §14.2;
 * ROADMAP.md Phase 3, PR 2 decision 3):
 *
 * 1. what changes, naming the doc and section
 * 2. what the scope resolves to, and its size against `max_context_bytes`
 * 3. whether it creates the manifest or else what it replaces, and the first warning
 *
 * The same text is the elicitation message and the chat preview, so both paths ask the same
 * question.
 */
export function scopeApprovalMessage(
	preview: ScopePreview,
	change: ScopeChange,
	create: NewManifestFields | undefined,
	maxBytes: number
): string {

	const scope = preview.scope;
	let target = scope.doc;
	if( scope.section !== undefined ) {
		target = `${scope.doc} § ${scope.section}`;
	}
	const lines = [
		`${target}: ${describeChanges( change )}`,
		`Resolves to ${count( scope.sources.length, "source", "sources" )}, ` +
			`${count( scope.context.length, "context file", "context files" )}, ` +
			`${formatBytes( scope.totalBytes )} of ${formatBytes( maxBytes )}.`
	];

	const details: string[] = [];
	if( preview.previous === undefined && create !== undefined ) {
		details.push( `Creates the manifest (${create.type}, ${create.status}).` );
	} else {
		details.push( `Was: ${describePrevious( preview, change )}.` );
	}
	const [ first, ...more ] = scope.warnings;
	if( first !== undefined ) {
		let warning = `Warning: ${describeScopeWarning( first )}`;
		if( more.length > 0 ) {
			warning += ` (and ${more.length} more)`;
		}
		details.push( `${warning}.` );
	}
	lines.push( details.join( " " ) );
	return lines.join( "\n" );
}

function describeChanges( change: ScopeChange ): string {

	const parts: string[] = [];
	for( const field of SCOPE_FIELDS ) {
		const value = change[ field ];
		if( value === undefined ) {
			continue;
		}
		if( value === null ) {
			if( field === "sources" && change.section !== undefined ) {
				parts.push( "use the doc's sources" );
			} else {
				parts.push( `remove ${field}` );
			}
		} else if( !Array.isArray( value ) && isReplaceContext( value ) ) {
			parts.push( `replace inherited context with ${describePatterns( value.replace )}` );
		} else {
			parts.push( `set ${field} to ${describePatterns( value )}` );
		}
	}
	if( parts.length === 0 ) {
		return "track it with no scope of its own";
	}
	return parts.join( "; " );
}

/** The changed fields as they were, at the level the change applies to. */
function describePrevious( preview: ScopePreview, change: ScopeChange ): string {

	const previous = preview.previous;
	let fields: { readonly [ K in ScopeField ]?: readonly string[] | ContextList } | undefined = previous;
	if( change.section !== undefined ) {
		fields = previous?.sections.get( change.section );
	}
	const parts: string[] = [];
	for( const field of SCOPE_FIELDS ) {
		if( change[ field ] === undefined ) {
			continue;
		}
		const value = fields?.[ field ];
		if( value === undefined && change.section !== undefined ) {
			parts.push( `${field} from the doc` );
		} else if( value === undefined ) {
			parts.push( `${field} not set` );
		} else if( !Array.isArray( value ) && isReplaceContext( value ) ) {
			parts.push( `${field} replace ${describePatterns( value.replace )}` );
		} else {
			parts.push( `${field} ${describePatterns( value )}` );
		}
	}
	if( parts.length === 0 ) {
		return "no scope of its own";
	}
	return parts.join( "; " );
}

function describePatterns( patterns: readonly string[] ): string {

	if( patterns.length === 0 ) {
		return "nothing";
	}
	return patterns.join( ", " );
}

function count( value: number, singular: string, plural: string ): string {

	if( value === 1 ) {
		return `1 ${singular}`;
	}
	return `${value} ${plural}`;
}
