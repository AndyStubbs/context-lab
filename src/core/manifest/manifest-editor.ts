import type { Node } from "yaml";
import { Document, isCollection, isMap, isScalar, isSeq, Pair, Scalar, visit, YAMLMap, YAMLSeq } from "yaml";
import type { YamlFile } from "../yaml/yaml-file.js";
import type { ContextList } from "./doc-manifest.js";
import { isReplaceContext } from "./doc-manifest.js";
import type { ScopeChange } from "./scope-change.js";

/**
 * The fields needed to create a manifest for a doc that has none.
 */
export interface NewManifestFields {
	readonly type: string;
	readonly status: string;
	readonly audience?: string;
	readonly owner?: string;
}

type ScopeField = "sources" | "context" | "exclude";

const SCOPE_FIELDS: readonly ScopeField[] = [ "sources", "context", "exclude" ];

// Where new keys go: after the last existing key that comes earlier in this order
const TOP_LEVEL_ORDER = [ "doc", "type", "status", "audience", "owner", "sources", "context", "exclude" ];
const SECTION_ORDER = [ "sources", "context", "exclude", "verified" ];

// New section-level lists are written inline, as in DESIGN.md §9, when they fit on one line
const MAX_FLOW_LINE = 100;

const TO_STRING_OPTIONS = {
	"indent": 2,
	"indentSeq": true,
	"lineWidth": 0,
	"flowCollectionPadding": false
} as const;

/**
 * Edits a manifest through the `yaml` `Document` API, keeping comments, key order and the
 * style of untouched nodes (CONV_TYPESCRIPT.md, YAML). It changes the document only; reading,
 * validating and writing the file are the manifest writer's job.
 */
export class ManifestEditor {

	private readonly m_document: Document;

	private constructor( document: Document ) {
		this.m_document = document;
	}

	/**
	 * Starts a new manifest for `docPath`.
	 *
	 * @param docPath Normalized workspace-relative doc path, as `WorkspaceRoot.resolve` returns.
	 */
	static create( docPath: string, fields: NewManifestFields ): ManifestEditor {

		const contents: Record<string, string> = {
			"doc": docPath,
			"type": fields.type,
			"status": fields.status
		};
		if( fields.audience !== undefined ) {
			contents[ "audience" ] = fields.audience;
		}
		if( fields.owner !== undefined ) {
			contents[ "owner" ] = fields.owner;
		}
		return new ManifestEditor( new Document( contents ) );
	}

	/**
	 * Edits a copy of a parsed manifest; `file` itself is left unchanged.
	 */
	static edit( file: YamlFile ): ManifestEditor {

		const document = file.document.clone();
		keepKeyLineComments( document, file.text );
		return new ManifestEditor( document );
	}

	/**
	 * Applies a scope change. Lists that keep some of their items keep those items' nodes,
	 * so their comments and quoting survive. A section entry left empty is removed, and so is
	 * `sections` when it has no entries left.
	 *
	 * @returns Whether the document changed.
	 */
	applyScopeChange( change: ScopeChange ): boolean {

		const top = this.topMap();
		let target: YAMLMap | undefined = top;
		if( change.section !== undefined ) {
			const isSetting = SCOPE_FIELDS.some(
				( field ) => change[ field ] !== undefined && change[ field ] !== null
			);
			target = sectionMap( top, change.section, isSetting );
		}
		if( target === undefined ) {
			return false;
		}

		const isSection = change.section !== undefined;
		let changed = false;
		for( const field of SCOPE_FIELDS ) {
			const value = change[ field ];
			if( value === undefined ) {
				continue;
			}
			let fieldChanged: boolean;
			if( value === null ) {
				fieldChanged = removePair( target, field );
			} else {
				fieldChanged = setScopeField( target, field, value, isSection );
			}
			if( fieldChanged ) {
				changed = true;
			}
		}

		if( change.section !== undefined ) {
			removeEmptySection( top, change.section );
		}
		return changed;
	}

	/** The manifest as YAML text, with a trailing newline. */
	toString(): string {
		return this.m_document.toString( TO_STRING_OPTIONS );
	}

	private topMap(): YAMLMap {

		// Parsed manifests were validated and new ones are built from an object, so the top
		// level is always a mapping
		const contents = this.m_document.contents;
		if( !isMap( contents ) ) {
			throw new Error( "Manifest top level is not a mapping" );
		}
		return contents;
	}
}

/**
 * `yaml` stores a comment written after `key:` as a comment before the key's block value, and
 * prints it on its own line under the key. Moving it onto the key keeps it on the key line, so
 * rewriting `sources: # authoritative` doesn't move the comment.
 */
function keepKeyLineComments( document: Document, text: string ): void {

	visit( document, {
		"Pair": ( _key, pair ) => {
			const key = pair.key;
			const value = pair.value;
			if(
				!isScalar( key ) || !isCollection( value ) || value.flow === true ||
				typeof value.commentBefore !== "string" || key.range === null || key.range === undefined
			) {
				return;
			}
			const lineEnd = text.indexOf( "\n", key.range[ 2 ] );
			let rest = text.slice( key.range[ 2 ] );
			if( lineEnd !== -1 ) {
				rest = text.slice( key.range[ 2 ], lineEnd );
			}
			if( !/^[ \t]*:[ \t]+#/.test( rest ) ) {
				return;
			}
			const [ first, ...others ] = value.commentBefore.split( "\n" );
			key.comment = first ?? null;
			if( others.length > 0 ) {
				value.commentBefore = others.join( "\n" );
			} else {
				value.commentBefore = null;
			}
		}
	} );
}

function sectionMap( top: YAMLMap, slug: string, create: boolean ): YAMLMap | undefined {

	const existing = top.get( "sections", true );
	let sections: YAMLMap;
	if( isMap( existing ) ) {
		sections = existing;
	} else {
		if( !create ) {
			return undefined;
		}
		sections = new YAMLMap();
		const key = new Scalar( "sections" );
		key.spaceBefore = top.items.length > 0;
		top.items.push( new Pair( key, sections ) );
	}

	const section = sections.get( slug, true );
	if( isMap( section ) ) {
		return section;
	}
	if( !create ) {
		return undefined;
	}
	const created = new YAMLMap();
	sections.items.push( new Pair( new Scalar( slug ), created ) );
	return created;
}

function removeEmptySection( top: YAMLMap, slug: string ): void {

	const sections = top.get( "sections", true );
	if( !isMap( sections ) ) {
		return;
	}
	const section = sections.get( slug, true );
	if( isMap( section ) && section.items.length === 0 ) {
		removePair( sections, slug );
	}
	if( sections.items.length === 0 ) {
		removePair( top, "sections" );
	}
}

function setScopeField(
	map: YAMLMap,
	field: ScopeField,
	value: ContextList,
	isSection: boolean
): boolean {

	const index = indexOfKey( map, field );
	const existing = pairValue( map, index );
	let replacement: YAMLSeq | YAMLMap;
	if( isReplaceContext( value ) ) {
		if( isMap( existing ) ) {
			const inner = existing.get( "replace", true );
			if( isSeq( inner ) ) {
				return updateItems( inner, value.replace );
			}
		}
		replacement = newReplaceMap( value.replace, flowFor( map, field, value.replace, isSection ) );
	} else {
		if( isSeq( existing ) ) {
			return updateItems( existing, value );
		}
		replacement = newSequence( value, flowFor( map, field, value, isSection ) );
	}

	const pair = map.items[ index ];
	if( pair !== undefined ) {

		// Switching between a list and `{ replace: [...] }`: keep the comments around the value
		if( existing !== null ) {
			replacement.commentBefore = existing.commentBefore ?? null;
			replacement.comment = existing.comment ?? null;
		}
		pair.value = replacement;
		return true;
	}

	insertPair( map, field, replacement, isSection );
	return true;
}

/**
 * Sets the items of a list, reusing the nodes of items it keeps.
 *
 * @returns Whether the items changed.
 */
function updateItems( seq: YAMLSeq, values: readonly string[] ): boolean {

	const current = seq.items.map( ( item ) => {
		if( isScalar( item ) ) {
			return item.value;
		}
		return undefined;
	} );
	if( current.length === values.length && current.every( ( item, index ) => item === values[ index ] ) ) {
		return false;
	}

	const unused = [ ...seq.items ];
	seq.items = values.map( ( value ) => {
		const index = unused.findIndex( ( item ) => isScalar( item ) && item.value === value );
		const reused = unused[ index ];
		if( index === -1 || reused === undefined ) {
			return new Scalar( value );
		}
		unused.splice( index, 1 );
		return reused;
	} );
	return true;
}

function newSequence( values: readonly string[], flow: boolean ): YAMLSeq {

	const seq = new YAMLSeq();
	seq.flow = flow;
	seq.items = values.map( ( value ) => new Scalar( value ) );
	return seq;
}

function newReplaceMap( values: readonly string[], flow: boolean ): YAMLMap {

	const map = new YAMLMap();
	map.flow = flow;
	map.items.push( new Pair( new Scalar( "replace" ), newSequence( values, flow ) ) );
	return map;
}

/**
 * Whether a new list is written inline: in sections, when it fits on one line; at the top
 * level, never, matching DESIGN.md §9.
 */
function flowFor( map: YAMLMap, field: string, values: readonly string[], isSection: boolean ): boolean {

	if( !isSection ) {
		return false;
	}

	// A section key sits two levels deep; each item adds its text plus `, ` and maybe quotes
	const indent = 4;
	const length = indent + field.length + 4 + values.reduce( ( sum, value ) => sum + value.length + 4, 0 );

	// Inside a non-empty inline mapping only an inline list is valid; an empty one becomes a block
	return ( map.flow === true && map.items.length > 0 ) || length <= MAX_FLOW_LINE;
}

/**
 * Inserts a new pair after the last key that comes earlier in the canonical order. The first
 * scope field at the top level gets a blank line before it, as in DESIGN.md §9.
 */
function insertPair( map: YAMLMap, field: ScopeField, value: Node, isSection: boolean ): void {

	let order = TOP_LEVEL_ORDER;
	if( isSection ) {
		order = SECTION_ORDER;
	}
	const rank = order.indexOf( field );
	let index = 0;
	map.items.forEach( ( pair, position ) => {
		const keyRank = order.indexOf( keyOf( pair ) ?? "" );
		if( keyRank !== -1 && keyRank < rank ) {
			index = position + 1;
		}
	} );

	const key = new Scalar( field );
	if( !isSection && !SCOPE_FIELDS.some( ( other ) => indexOfKey( map, other ) !== -1 ) ) {
		key.spaceBefore = true;
	}

	// A section written as `{}` becomes a block mapping once it has content
	if( map.items.length === 0 ) {
		map.flow = false;
	}
	map.items.splice( index, 0, new Pair( key, value ) );
}

/**
 * Removes a pair. A blank line before it moves to the pair that follows, so groups stay
 * separated. Comments above the removed key go with it.
 *
 * @returns Whether the key was present.
 */
function removePair( map: YAMLMap, key: string ): boolean {

	const index = indexOfKey( map, key );
	if( index === -1 ) {
		return false;
	}
	const [ removed ] = map.items.splice( index, 1 );
	const next = map.items[ index ];
	if( isScalar( removed?.key ) && removed.key.spaceBefore === true && isScalar( next?.key ) ) {
		next.key.spaceBefore = true;
	}
	return true;
}

function indexOfKey( map: YAMLMap, key: string ): number {
	return map.items.findIndex( ( pair ) => keyOf( pair ) === key );
}

function keyOf( pair: Pair ): string | undefined {

	if( isScalar( pair.key ) && typeof pair.key.value === "string" ) {
		return pair.key.value;
	}
	return undefined;
}

function pairValue( map: YAMLMap, index: number ): Node | null {

	const pair = map.items[ index ];
	if( pair === undefined || pair.value === null || pair.value === undefined ) {
		return null;
	}
	return pair.value as Node;
}
