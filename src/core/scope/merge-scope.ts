import type { ContextList, DocManifest } from "../manifest/doc-manifest.js";
import { isReplaceContext } from "../manifest/doc-manifest.js";
import type { WorkspaceConfig } from "../workspace/workspace-config.js";
import type { ReplacedRule, ScopeReason } from "./resolved-scope.js";

/**
 * The patterns for a doc or section after the merge steps of DESIGN.md §9, each tagged with
 * its rule. Nothing is expanded yet.
 */
export interface ScopeRules {
	readonly sources: readonly ScopeReason[];
	readonly context: readonly ScopeReason[];
	readonly exclude: readonly ScopeReason[];
	readonly replaced: readonly ReplacedRule[];
}

/**
 * Applies §9 steps 1 to 3: start from workspace defaults, merge the doc's fields, then the
 * section's. Lists merge, `{ replace: [...] }` replaces, and section `sources` replace the
 * doc's sources. A section without a manifest entry gets the doc-level rules.
 */
export function mergeScopeRules( config: WorkspaceConfig, manifest: DocManifest, section?: string ): ScopeRules {

	const replaced: ReplacedRule[] = [];
	let sources: readonly ScopeReason[] = tag( "sources", manifest.sources ?? [] );
	let context: readonly ScopeReason[] = tag( "defaults.context", config.defaults.context );
	const exclude = [
		...tag( "defaults.exclude", config.defaults.exclude ),
		...tag( "exclude", manifest.exclude ?? [] )
	];
	context = mergeContext( context, "context", manifest.context, replaced );

	let scope;
	if( section !== undefined ) {
		scope = manifest.sections.get( section );
	}
	if( section !== undefined && scope !== undefined ) {
		const prefix = `sections.${section}`;
		if( scope.sources !== undefined ) {
			noteReplaced( sources, `${prefix}.sources`, replaced );
			sources = tag( `${prefix}.sources`, scope.sources );
		}
		context = mergeContext( context, `${prefix}.context`, scope.context, replaced );
		exclude.push( ...tag( `${prefix}.exclude`, scope.exclude ?? [] ) );
	}
	return { "sources": sources, "context": context, "exclude": exclude, "replaced": replaced };
}

function mergeContext(
	current: readonly ScopeReason[],
	rule: string,
	value: ContextList | undefined,
	replaced: ReplacedRule[]
): readonly ScopeReason[] {

	if( value === undefined ) {
		return current;
	}
	if( isReplaceContext( value ) ) {
		noteReplaced( current, rule, replaced );
		return tag( rule, value.replace );
	}
	return [ ...current, ...tag( rule, value ) ];
}

/** Records each rule that had patterns before `by` replaced them, once per rule. */
function noteReplaced( current: readonly ScopeReason[], by: string, replaced: ReplacedRule[] ): void {

	const rules = new Set( current.map( ( reason ) => reason.rule ) );
	for( const rule of rules ) {
		replaced.push( { "rule": rule, "by": by } );
	}
}

function tag( rule: string, patterns: readonly string[] ): ScopeReason[] {
	return patterns.map( ( pattern ) => ( { "rule": rule, "pattern": pattern } ) );
}
