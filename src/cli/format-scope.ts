import { describeExclusion, describeReason, describeReplaced } from "../core/scope/describe-scope.js";
import type { ResolvedScope, ScopeEntry, ScopeWarning } from "../core/scope/resolved-scope.js";
import { formatBytes } from "../core/scope/format-bytes.js";

const INDENT = "  ";
const GAP = "  ";

/**
 * Formats the explain view for `docctx scope` (DESIGN.md §9): a summary line, then Sources,
 * Context, Excluded, Replaced and Warnings, leaving out empty groups. Each file shows its size
 * and the first rule that matched it, with any further rules on the lines below.
 *
 * @param maxBytes The workspace's `settings.max_context_bytes`, shown next to the total.
 */
export function formatScope( scope: ResolvedScope, maxBytes: number ): string {

	let heading = scope.doc;
	if( scope.section !== undefined ) {
		heading = `${scope.doc} § ${scope.section}`;
	}
	const summary = `${count( scope.sources.length, "source", "sources" )}, ` +
		`${count( scope.context.length, "context file", "context files" )}, ` +
		`${formatBytes( scope.totalBytes )} of ${formatBytes( maxBytes )}`;

	// Sources and context share column widths, so they read as one table
	const included = [ ...scope.sources, ...scope.context ];
	const widths = {
		"path": Math.max( 0, ...included.map( ( entry ) => entry.path.length ) ),
		"size": Math.max( 0, ...included.map( ( entry ) => formatBytes( entry.sizeBytes ).length ) )
	};
	const groups: string[] = [ `${heading}\n${summary}\n` ];
	if( scope.sources.length > 0 ) {
		groups.push( formatEntries( "Sources", scope.sources, widths ) );
	}
	if( scope.context.length > 0 ) {
		groups.push( formatEntries( "Context", scope.context, widths ) );
	}
	if( scope.excluded.length > 0 ) {
		const width = Math.max( ...scope.excluded.map( ( entry ) => entry.path.length ) );
		const lines = scope.excluded.map( ( entry ) => formatRow(
			`${INDENT}${entry.path.padEnd( width )}${GAP}`,
			[
				describeExclusion( entry.excludedBy ),
				...entry.reasons.map( ( reason ) => `matched by ${describeReason( reason )}` )
			]
		) );
		groups.push( `Excluded\n${lines.join( "" )}` );
	}
	if( scope.replaced.length > 0 ) {
		const lines = scope.replaced.map( ( replaced ) => `${INDENT}${describeReplaced( replaced )}\n` );
		groups.push( `Replaced\n${lines.join( "" )}` );
	}
	if( scope.warnings.length > 0 ) {
		const lines = scope.warnings.map( ( warning ) => formatRow( INDENT, describeWarning( warning ) ) );
		groups.push( `Warnings\n${lines.join( "" )}` );
	}
	return groups.join( "\n" );
}

function formatEntries(
	title: string,
	entries: readonly ScopeEntry[],
	widths: { readonly path: number; readonly size: number }
): string {

	const lines = entries.map( ( entry ) => {
		const size = formatBytes( entry.sizeBytes ).padStart( widths.size );
		const prefix = `${INDENT}${entry.path.padEnd( widths.path )}${GAP}${size}${GAP}`;
		return formatRow( prefix, entry.reasons.map( describeReason ) );
	} );
	return `${title}\n${lines.join( "" )}`;
}

/** The first detail after `prefix`, the rest on their own lines aligned under it. */
function formatRow( prefix: string, details: readonly string[] ): string {

	const continuation = " ".repeat( prefix.length );
	return details.map( ( detail, index ) => {
		if( index === 0 ) {
			return `${prefix}${detail}\n`;
		}
		return `${continuation}${detail}\n`;
	} ).join( "" );
}

function describeWarning( warning: ScopeWarning ): readonly string[] {

	switch( warning.kind ) {
		case "no-match":
			return [ `${warning.rule}: ${warning.pattern} matched no files` ];
		case "over-budget":
			return [
				`scope is ${formatBytes( warning.totalBytes )}, ` +
				`over max_context_bytes (${formatBytes( warning.maxBytes )})`
			];
		case "unreadable-manifest":
			return [
				`${warning.manifest} is invalid, so its doc was left out:`,
				...warning.message.split( "\n" ).map( ( line ) => `${INDENT}${line}` )
			];
	}
}

function count( value: number, singular: string, plural: string ): string {

	if( value === 1 ) {
		return `1 ${singular}`;
	}
	return `${value} ${plural}`;
}
